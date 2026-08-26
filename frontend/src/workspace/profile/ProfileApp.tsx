'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { CheckCircle2, ImagePlus, Trash2 } from 'lucide-react';
import { AuthUserSchema } from '@/domain/clients/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { useTenant } from '@/components/TenantProvider';
import { useWorkspaceAuth } from '@/workspace/components/WorkspaceAuthProvider';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AvatarType = (typeof AVATAR_TYPES)[number];

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

function extensionFor(type: AvatarType): string {
  return type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);
}

async function cropImage(source: string, crop: Area, type: AvatarType): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new Image();
    value.onload = () => resolve(value);
    value.onerror = () => reject(new Error('Não foi possível abrir a imagem selecionada.'));
    value.src = source;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar o recorte da imagem.');
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, 512, 512);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (!blob) throw new Error('Não foi possível gerar a imagem recortada.');
  if (blob.size > MAX_AVATAR_BYTES) throw new Error('A imagem recortada deve ter no máximo 5 MB.');
  return new File([blob], `avatar.${extensionFor(type)}`, { type });
}

export default function ProfileApp() {
  const { href } = useTenant();
  const { workspaceUser, updateWorkspaceUser } = useWorkspaceAuth();
  const [nameDraft, setNameDraft] = useState<string | undefined>();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropType, setCropType] = useState<AvatarType>('image/jpeg');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const name = nameDraft ?? workspaceUser?.name ?? '';
  const shownAvatar = removeAvatar ? null : avatarPreview ?? workspaceUser?.avatarUrl ?? null;

  function closeCropper() {
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(null);
    setCropArea(null);
  }

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type as AvatarType)) {
      setError('Escolha uma imagem PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('A imagem deve ter no máximo 5 MB.');
      return;
    }
    setError('');
    closeCropper();
    setCropSource(URL.createObjectURL(file));
    setCropType(file.type as AvatarType);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  async function applyCrop() {
    if (!cropSource || !cropArea) return;
    setCropping(true);
    setError('');
    try {
      const file = await cropImage(cropSource, cropArea, cropType);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setRemoveAvatar(false);
      closeCropper();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível recortar a imagem.');
    } finally {
      setCropping(false);
    }
  }

  function markAvatarForRemoval() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(true);
    setSaved(false);
  }

  async function responseUser(response: Response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Não foi possível salvar seu perfil.');
    const user = AuthUserSchema.safeParse(payload);
    if (!user.success) throw new Error('A resposta do servidor para o perfil é inválida.');
    return user.data;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      let user = await responseUser(await fetch('/api/workspace-session/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      }));
      if (avatarFile) {
        const body = new FormData();
        body.append('avatar', avatarFile);
        user = await responseUser(await fetch('/api/workspace-session/profile', { method: 'POST', body }));
      } else if (removeAvatar && workspaceUser?.avatarUrl) {
        user = await responseUser(await fetch('/api/workspace-session/profile', { method: 'DELETE' }));
      }
      updateWorkspaceUser(user);
      setNameDraft(user.name);
      setAvatarFile(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
      setRemoveAvatar(false);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  function closePasswordModal() {
    setPasswordModalOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação não confere com a nova senha.');
      return;
    }
    setPasswordSaving(true);
    try {
      const response = await fetch('/api/workspace-session/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Não foi possível trocar sua senha.');
      }
      // Trocar a senha revoga todas as sessões (inclusive a atual), então
      // é preciso logar de novo.
      window.location.href = href('/workspace/login');
    } catch (reason) {
      setPasswordError(reason instanceof Error ? reason.message : 'Não foi possível trocar sua senha. Tente novamente.');
      setPasswordSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-background">
      <HubHeader title="Meu perfil" description="Atualize como seu nome e sua foto aparecem para a equipe." />
      <main className="mx-auto grid max-w-3xl gap-5 p-4 sm:p-6 md:grid-cols-[13rem_1fr]">
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-brand-primary text-2xl font-extrabold text-white">
            {shownAvatar ? <img className="size-full object-cover" src={shownAvatar} alt="Prévia da foto de perfil" /> : initials(name || '?')}
          </span>
          <div><p className="font-bold text-foreground">{name || '?'}</p><p className="mt-1 text-sm text-muted-foreground">{workspaceUser?.email}</p></div>
        </Card>

        <Card className="p-5 sm:p-6">
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="profile-name">Nome</label>
              <Input id="profile-name" value={name} onChange={(event) => setNameDraft(event.target.value)} autoComplete="name" required />
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold text-foreground">Foto de perfil</p>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control bg-brand-background px-4 text-sm font-bold text-brand-primary transition-colors hover:bg-[#e4e4e7]"><ImagePlus className="size-4" aria-hidden="true" />Escolher imagem<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectAvatar} /></label>
                {shownAvatar && <Button type="button" variant="outline" onClick={markAvatarForRemoval}><Trash2 className="size-4" aria-hidden="true" />Remover foto</Button>}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">PNG, JPEG ou WebP, até 5 MB. Você poderá ajustar o recorte antes de salvar.</p>
            </div>
            {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
            {saved && <p className="flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 className="size-4" aria-hidden="true" />Perfil atualizado.</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <Button type="button" variant="outline" onClick={() => setPasswordModalOpen(true)}>Alterar senha</Button>
              <Button type="submit" loading={saving}>Salvar alterações</Button>
            </div>
          </form>
        </Card>
      </main>

      <Dialog open={passwordModalOpen} onOpenChange={(open) => !open && closePasswordModal()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><div><DialogTitle>Alterar senha</DialogTitle><DialogDescription>Você precisará entrar novamente depois de trocar a senha.</DialogDescription></div><DialogCloseButton /></DialogHeader>
          <form className="flex flex-col gap-5" onSubmit={handlePasswordSubmit}>
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="current-password">Senha atual</label>
              <Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="new-password">Nova senha</label>
              <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={6} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="confirm-password">Confirmar nova senha</label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required />
            </div>
            {passwordError && <p className="text-sm font-medium text-danger" role="alert">{passwordError}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={closePasswordModal}>Cancelar</Button><Button type="submit" loading={passwordSaving}>Trocar senha</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cropSource)} onOpenChange={(open) => !open && closeCropper()}>
        <DialogContent className="max-w-xl">
          <DialogHeader><div><DialogTitle>Ajustar foto</DialogTitle><DialogDescription>Posicione a área quadrada que será usada no perfil.</DialogDescription></div><DialogCloseButton /></DialogHeader>
          <div className="relative h-72 overflow-hidden rounded-control bg-black">
            {cropSource && <Cropper image={cropSource} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, area) => setCropArea(area)} />}
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">Zoom<input className="w-full accent-brand-primary" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeCropper}>Cancelar</Button><Button type="button" loading={cropping} onClick={() => void applyCrop()}>Usar recorte</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
