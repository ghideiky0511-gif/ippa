'use client';

import { AtSign, Mail, MapPin, MessageCircle } from 'lucide-react';
import Link from '@/components/TenantLink';
import { CONFIG } from '@/lib/config';
import { publicUi } from '@/lib/ui';
import { useTenant } from './TenantProvider';
import type { AuthUser } from '@/domain/clients/types';

function formatWhatsapp(number: string) {
  const digits = number.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const areaCode = digits.slice(2, 4);
    const localNumber = digits.slice(4);
    const separator = localNumber.length === 9 ? 5 : 4;
    return `+55 (${areaCode}) ${localNumber.slice(0, separator)}-${localNumber.slice(separator)}`;
  }
  return `+${digits}`;
}

export default function CatalogFooter({ authUser }: { authUser: AuthUser | null }) {
  const { tenant } = useTenant();
  const { contact, footer } = CONFIG;
  const hasContact = Boolean(contact.email || contact.whatsappNumber || contact.instagramUrl || contact.address || contact.serviceHours);
  const isInternal = authUser != null && authUser.role !== 'cliente';
  const whatsappHref = contact.whatsappNumber
    ? `https://wa.me/${contact.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Preciso de ajuda com o catálogo da ${tenant.name}.`)}`
    : '';

  return (
    <footer className={publicUi.catalogFooter}>
      <div className={`${publicUi.container} ${publicUi.catalogFooterGrid}`}>
        <section className={publicUi.catalogFooterBrand} aria-label={`Sobre ${tenant.name}`}>
          <p className={publicUi.catalogFooterEyebrow}>Catálogo online</p>
          <h2>{tenant.name}</h2>
          <p>Uma seleção pensada para você comprar com calma, de onde estiver.</p>
        </section>

        <nav className={publicUi.catalogFooterSection} aria-label="Navegação do rodapé">
          <h2>Explorar</h2>
          <Link href="/catalogo">Catálogo</Link>
          {!isInternal && <Link href="/pedidos">Meus pedidos</Link>}
        </nav>

        <section className={publicUi.catalogFooterSection} aria-label="Atendimento">
          <h2>Atendimento</h2>
          {contact.whatsappNumber && (
            <a href={whatsappHref} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4" aria-hidden="true" />
              <span>WhatsApp: {formatWhatsapp(contact.whatsappNumber)}</span>
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`}>
              <Mail className="size-4" aria-hidden="true" />
              <span>{contact.email}</span>
            </a>
          )}
          {contact.instagramUrl && (
            <a href={contact.instagramUrl} target="_blank" rel="noreferrer">
              <AtSign className="size-4" aria-hidden="true" />
              <span>Instagram</span>
            </a>
          )}
          {contact.address && (
            <p><MapPin className="size-4" aria-hidden="true" /><span>{contact.address}</span></p>
          )}
          {contact.serviceHours && <p className={publicUi.catalogFooterHours}>{contact.serviceHours}</p>}
          {!hasContact && <p className={publicUi.catalogFooterHours}>Canais de atendimento em breve.</p>}
        </section>
      </div>

      <div className={`${publicUi.container} ${publicUi.catalogFooterBottom}`}>
        <p>© {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.</p>
        {(footer.privacyUrl || footer.termsUrl) && (
          <nav aria-label="Informações legais">
            {footer.privacyUrl && <a href={footer.privacyUrl}>Privacidade</a>}
            {footer.termsUrl && <a href={footer.termsUrl}>Termos de uso</a>}
          </nav>
        )}
      </div>
    </footer>
  );
}
