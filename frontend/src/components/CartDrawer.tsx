'use client';

import Link from '@/components/TenantLink';
import { MessageCircle, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/format';
import { CONFIG } from '@/lib/config';
import { useCart } from './CartProvider';
import { useAuthUser } from './AuthProvider';
import { applyStockChangeClamp, buildStockChangeSummary, parseStockChangeDetails } from '@/lib/stockChangeError';
import GroupedCartItems from './GroupedCartItems';
import { useTenant } from './TenantProvider';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { useState } from 'react';

export default function CartDrawer() {
  const router = useRouter();
  const { cart, cartCount, cartSubtotal, cartDiscountLabel, cartDiscountTotal, cartTotal, isCartOpen, closeCart, saveOrderToHistory, changeQty, removeFromCart } = useCart();
  const { showPrices } = useAuthUser();
  const { tenant, href } = useTenant();
  const [isSendingWhatsapp, setSendingWhatsapp] = useState(false);

  async function checkoutWhatsapp() {
    if (cartCount === 0) {
      toast.error('Seu carrinho está vazio. Adicione peças e escolha a grade antes de continuar.');
      return;
    }
    if (isSendingWhatsapp) return;
    if (!CONFIG.contact.whatsappNumber) {
      toast.error('O WhatsApp da loja ainda não foi configurado.');
      return;
    }
    const resolvedItems = cart.filter((item) => item.qty > 0);
    const lines = [`Olá! Gostaria de fazer o seguinte pedido no ${tenant.name}:`, ''];
    resolvedItems.forEach((item) => {
      const variantParts = [item.color, item.size].filter(Boolean);
      const variantText = variantParts.length ? ` (${variantParts.join(' / ')})` : '';
      lines.push(`• ${item.qty}x ${item.name}${variantText} — ${formatBRL(item.price * item.qty)}`);
    });
    if (cartDiscountTotal > 0) lines.push('', `Desconto (${cartDiscountLabel}): -${formatBRL(cartDiscountTotal)}`);
    lines.push('', `Total: ${formatBRL(cartTotal)}`);
    window.open(`https://wa.me/${CONFIG.contact.whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
    setSendingWhatsapp(true);
    try {
      await saveOrderToHistory(resolvedItems, cartTotal, {
        discount: cartDiscountTotal > 0 ? { label: cartDiscountLabel!, amount: cartDiscountTotal } : undefined,
      });
      closeCart();
    } catch (cause) {
      const details = parseStockChangeDetails(cause);
      if (details) {
        applyStockChangeClamp(cart, details, changeQty, removeFromCart);
        toast.error(`O estoque de algumas peças mudou — ajustamos seu carrinho: ${buildStockChangeSummary(details)}`);
        closeCart();
        router.push(href('/carrinho'));
      } else {
        toast.error(cause instanceof Error ? cause.message : 'Não foi possível registrar o pedido. Seu carrinho foi preservado.');
      }
    } finally {
      setSendingWhatsapp(false);
    }
  }

  function goToCheckout() {
    closeCart();
    router.push(href('/carrinho'));
  }

  return (
    <Sheet open={isCartOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent side="right" className="w-[min(100%,26rem)]">
        <SheetHeader><h2 className="text-lg font-bold">Seu pedido</h2></SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {cart.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <ShoppingBag className="mb-3 size-7 text-brand-primary" aria-hidden="true" />
              <p className="font-semibold">Seu carrinho está vazio.</p>
              <p className="mt-1 text-sm text-muted-foreground">Escolha peças no catálogo para começar.</p>
            </div>
          ) : <GroupedCartItems cart={cart} />}
        </div>
        <div className="border-t border-border bg-surface-raised p-5">
          {!showPrices ? <Link href="/login" className="text-sm font-bold text-brand-primary">Entrar para ver o preço</Link> : (
            <div className="mb-4 space-y-1.5 text-sm">
              {cartDiscountTotal > 0 && <><div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatBRL(cartSubtotal)}</span></div><div className="flex justify-between text-success"><span>Desconto ({cartDiscountLabel})</span><span>-{formatBRL(cartDiscountTotal)}</span></div></>}
              <div className="flex justify-between text-base font-extrabold"><span>Total</span><span>{formatBRL(cartTotal)}</span></div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button type="button" className="w-full" onClick={goToCheckout} disabled={cart.length === 0}>Revisar e continuar</Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => void checkoutWhatsapp()} disabled={isSendingWhatsapp}><MessageCircle className="size-4" aria-hidden="true" />{isSendingWhatsapp ? 'Registrando…' : 'Finalizar pelo WhatsApp'}</Button>
          </div>
          <p className="mt-3 text-[11px] leading-4 text-muted-foreground">Ao enviar pelo WhatsApp, nada é cobrado automaticamente.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
