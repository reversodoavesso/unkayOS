# unkayOS — Changelog

O contador de releases começa em 1 com a versão 2.0.0-alpha.2. Builds da mesma versão preservam o número; cada release preparada incrementa o contador.

## 2.0.0-alpha.6 · Release 5 · 2026-10-27

SSO e computação autenticada

- Terminal solicita ticket de uso único no mesmo domínio, com autorização e MFA no servidor.
- Tokens deixam de aparecer em URLs e mensagens da ponte de computação.

## 2.0.0-alpha.5 · Release 4 · 2026-10-27

Login integrado ao RDA

- SSO com cliente registrado no Zitadel e configuração por implantação.
- Identidade e permissões verificadas pelo núcleo RDA antes de abrir uma sessão.

## 2.0.0-alpha.4 · Release 3 · 2026-10-27

Loja e instalação de aplicativos

- Loja com inventário real, filtros de instalados, disponíveis, atualizações e restrições detalhadas.
- Gerenciador compartilhado para instalar, abrir, atualizar e remover pacotes OpenUI com persistência e validação de integridade.
- API da loja com autenticação, curadoria por versão e bloqueios de perfil, permissões e runtime.

## 2.0.0-alpha.3 · Release 2 · 2026-10-26

Abertura confiável e personalização do espaço

- Corrigido o tipo MIME de módulos .mjs no Nginx, permitindo abrir OpenUI Studio e Marketplace.
- Nova tela de falha com tentar novamente, fechar, recarregar o sistema e diagnóstico técnico copiável.
- Falhas de inicialização recebem tratamento próprio; repetir cria uma instância limpa e encerra recursos anteriores.
- Validação de produção exige instâncias inicializadas, verifica dependências ES modules e exercita o OpenUI real.
- Coleção Intervalos com sete wallpapers e ajuste opcional de cor e luminosidade ao destaque do sistema.
- Paletas de imagem geradas pelo DS, importação de imagens locais/VFS, cache de aparência revisado e kernel Wasm validado contra JavaScript.

## 2.0.0-alpha.2 · Release 1 · 2026-10-26

Seu espaço, do seu jeito

- Boas-vindas com preferências, conta opcional e configuração inicial.
- Barra e menu configuráveis, favoritos, busca e rótulos ocultos por padrão.
- Widgets com visibilidade e início configuráveis; importação segura de notas e links.
- RDA DS 3.5.0 com sete accents, controles oficiais, catálogo de ícones e guia para criar apps.
- Orb com adaptação vetorial para tamanhos pequenos; marca RDA opcional na implantação.
- Cards alinhados, rolagem interna ao menu e indicador de abertura sem atrasar os apps.
- Wallpaper restaurado antes da primeira renderização; preferências e arquivos persistentes.
- Correções de autenticação, navegador, SDK, isolamento CSS e ciclo de vida de apps.
- Versão unificada, contador de releases, revisão do build e histórico nas informações do sistema.
