// =====================================================================
// CIMED · Atividades BP · Pouso Alegre
// ÚNICO ARQUIVO QUE VOCÊ PRECISA EDITAR
// =====================================================================
//
// Onde achar estes dois valores:
//   Supabase > seu projeto > Project Settings > Data API
//     - Project URL                 -> cole em SUPABASE_URL
//     - chave publishable / anon    -> cole em SUPABASE_ANON_KEY
//
// A chave publishable foi feita para ficar visível no navegador. Quem
// protege os dados é a RLS criada no arquivo supabase/01-schema.sql,
// que só libera cada BP a ver os próprios registros.
// NUNCA cole aqui a chave "service_role".
//
// IMPORTANTE: use um projeto Supabase SEPARADO do sistema de Gestão de
// Projetos. Lá a regra libera tudo para qualquer usuário logado, então
// cadastrar as BPs no mesmo banco daria acesso àqueles dados.
//
// =====================================================================

// Projeto Supabase "atividades-bp-cimed", organização Cimed, criado em 21/09/2026.
export const SUPABASE_URL = 'https://fkcaisxroabeekqfrxor.supabase.co';

// Chave publishable (a antiga "anon"). Pode ficar visível no navegador:
// quem protege os dados é a RLS criada no supabase/01-schema.sql.
export const SUPABASE_ANON_KEY = 'sb_publishable_SuRhBpQ0OgMoTXg-I5WPVA_v7nWp87-';

// ---------------------------------------------------------------------
// Ajustes do sistema
// ---------------------------------------------------------------------
export const CONFIG = {
  unidade: 'Pouso Alegre',
  // Endereço do sistema no ar. Entra no e-mail de convite que a tela de
  // Gestão monta. Se mudar o nome do repositório, atualize aqui.
  urlSite: 'https://transformacaodigitalcimed.github.io/atividades-bp-cimed/',
  // Assinatura do e-mail de convite. Troque aqui se quiser outro nome.
  assinatura: 'Recursos Humanos · Cimed',
  // Domínio aceito no cadastro. A trava de verdade está no banco
  // (função bp_trata_novo_usuario); aqui é só para avisar antes.
  dominio: '@grupocimed.com.br',
  // Atalhos de tempo que aparecem no formulário, em minutos.
  atalhosTempo: [15, 30, 45, 60, 90, 120, 240],
};
