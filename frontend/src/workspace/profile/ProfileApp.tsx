'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AuthUserSchema } from '@/domain/clients/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { useWorkspaceAuth } from '@/workspace/components/WorkspaceAuthProvider';

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

export default function ProfileApp() {
  const { workspaceUser, updateWorkspaceUser } = useWorkspaceAuth();
  const [draft, setDraft] = useState<{ name?: string; avatarUrl?: string }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const name = draft.name ?? workspaceUser?.name ?? '';
  const avatarUrl = draft.avatarUrl ?? workspaceUser?.avatarUrl ?? '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch('/api/workspace-session/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatarUrl: avatarUrl.trim() || null }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error || 'Não foi possível salvar seu perfil.');
        return;
      }
      const user = AuthUserSchema.safeParse(payload);
      if (!user.success) {
        setError('A resposta do servidor para o perfil é inválida.');
        return;
      }
      updateWorkspaceUser(user.data);
      setDraft({ name: user.data.name, avatarUrl: user.data.avatarUrl ?? '' });
      setSaved(true);
    } catch {
      setError('Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const previewName = name.trim() || workspaceUser?.name || '?';
  const previewAvatar = avatarUrl.trim();

  return (
    <div className="min-h-screen bg-brand-background">
      <HubHeader title="Meu perfil" description="Atualize como seu nome e sua foto aparecem para a equipe." />
      <main className="mx-auto grid max-w-3xl gap-5 p-4 sm:p-6 md:grid-cols-[13rem_1fr]">
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-brand-primary text-2xl font-extrabold text-white">
            {previewAvatar ? <img className="size-full object-cover" src={previewAvatar} alt="Prévia da foto de perfil" /> : initials(previewName)}
          </span>
          <div>
            <p className="font-bold text-foreground">{previewName}</p>
            <p className="mt-1 text-sm text-muted-foreground">{workspaceUser?.email}</p>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="profile-name">Nome</label>
              <Input id="profile-name" value={name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} autoComplete="name" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="profile-avatar">URL da foto</label>
              <Input id="profile-avatar" type="url" value={avatarUrl} onChange={(event) => setDraft((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://exemplo.com/minha-foto.jpg" />
              <p className="mt-1.5 text-xs text-muted-foreground">Cole a URL de uma imagem. Deixe em branco para usar suas iniciais.</p>
            </div>
            {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
            {saved && <p className="flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 className="size-4" aria-hidden="true" />Perfil atualizado.</p>}
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>Salvar alterações</Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
