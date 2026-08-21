import {
  BarChart3,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  Percent,
  Plug,
  Settings2,
  Shirt,
  ShoppingBag,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface WorkspaceNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface WorkspaceNavGroup {
  label: string;
  items: WorkspaceNavItem[];
}

export const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    label: 'Início',
    items: [{ href: '/workspace', label: 'Visão geral', icon: LayoutDashboard }],
  },
  {
    label: 'Vendas',
    items: [
      { href: '/workspace/pedidos', label: 'Pedidos', icon: ShoppingBag },
      { href: '/workspace/clientes', label: 'Clientes', icon: Users },
      { href: '/catalogo', label: 'Catálogo', icon: ClipboardList },
    ],
  },
  {
    label: 'Conteúdo',
    items: [
      { href: '/workspace/builder', label: 'Home', icon: LayoutTemplate },
      { href: '/workspace/colecoes', label: 'Coleções', icon: FolderKanban },
      { href: '/workspace/produtos', label: 'Produtos', icon: Shirt },
      { href: '/workspace/descontos', label: 'Descontos', icon: Percent },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/workspace/relatorios', label: 'Relatórios', icon: BarChart3 },
      { href: '/workspace/ferramentas', label: 'Ferramentas', icon: Settings2 },
      { href: '/workspace/integracoes', label: 'Integrações', icon: Plug },
      { href: '/workspace/usuarios', label: 'Usuários', icon: UserCog },
      { href: '/workspace/perfil', label: 'Meu perfil', icon: UserRound },
    ],
  },
];

export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = WORKSPACE_NAV_GROUPS.flatMap((group) => group.items);
