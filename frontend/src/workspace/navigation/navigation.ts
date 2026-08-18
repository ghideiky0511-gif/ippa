export interface WorkspaceNavItem {
  href: string;
  label: string;
}

export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  { href: '/workspace', label: 'Visão geral' },
  { href: '/workspace/pedidos', label: 'Pedidos' },
  { href: '/workspace/clientes', label: 'Clientes' },
  { href: '/workspace/builder', label: 'Home' },
  { href: '/workspace/catalogo', label: 'Catálogo' },
  { href: '/workspace/colecoes', label: 'Coleções' },
  { href: '/workspace/produtos', label: 'Produtos' },
  { href: '/workspace/descontos', label: 'Descontos' },
  { href: '/workspace/relatorios', label: 'Relatórios' },
  { href: '/workspace/ferramentas', label: 'Ferramentas' },
  { href: '/workspace/usuarios', label: 'Usuários' },
];
