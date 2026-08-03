import { NextResponse } from 'next/server';
import catalog from '@/data/catalog.json';

// Hoje serve o catalog.json estático. Na Fase 2 este é o ponto de troca
// para buscar os dados de verdade na API da Bippa/ERP sem mudar o front.
export async function GET() {
  return NextResponse.json(catalog);
}
