# Criar apps no Unkayos com o RDA Design System

Este é o guia canônico para pessoas e agentes. A cópia fornecida ao SDK e a versão acessível pelo navegador são geradas a partir deste arquivo.

## 1. Como o DS chega ao app

O shell carrega uma distribuição oficial versionada em `/design-system/rda/`. Ela inclui CSS dos componentes, tokens, extensão Unkayos, runtime HTML de ícones e SVGs. O app herda esses recursos: não instale React para um app JavaScript nativo e não copie uma paleta própria.

O endereço de documentação local é `/design-system/guide.html`. O catálogo legível por ferramentas está em `/design-system/rda/icons/manifest.json` e a versão/hash em `/design-system/rda/distribution.json`.

CDN é o mecanismo para distribuir arquivos; DNS apenas aponta um domínio para a hospedagem. A execução local e o build Docker usam a cópia verificada do DS, sem depender de uma CDN em tempo de execução. Não substitua esses arquivos manualmente.

Para atualizar a cópia a partir do workspace:

```powershell
# No rda-ds: gere o pacote e o CSS standalone, incluindo a extensão Unkayos.
npm run build
# No unkayOS:
npm run sync:ds
npm run ds:check
```

Para um checkout separado, use `npm run sync:ds -- --from=C:/caminho/rda-ds`. Uma publicação de CDN pode expor os mesmos artefatos sob uma URL de versão fixa; preserve o manifesto e seus hashes. O comando `sync:ds` atual usa diretório local.

## 2. Gere um app funcional

```powershell
npm run scaffold -- --id minhas-notas --name "Minhas Notas" --icon file-text --register
npm run dev -- --host 127.0.0.1 --port 5178
```

O gerador cria `config.json`, `index.html`, `style.css`, `main.js` e um `icon.svg` oficial. `--register` acrescenta o app em `apps/apps.json`; sem essa opção, faça o registro explicitamente. `--dry-run` mostra os arquivos sem gravar. Diretórios existentes nunca são sobrescritos.

## 3. Componha controles reais do DS

```html
<label class="rda-label" for="title">Título</label>
<input id="title" class="rda-input rda-input--md" placeholder="Nome da nota">
<button type="button" class="rda-button rda-button--md" data-color="primary">
  <rda-icon name="save"></rda-icon>
  <span class="rda-button__content">Salvar</span>
</button>
<button type="button" class="rda-button rda-button--sm" data-color="danger" data-style="outlined">
  <rda-icon name="trash-2"></rda-icon> Excluir
</button>
<p role="status" id="status"></p>
```

Cor semântica (`data-color`), superfície (`data-style`) e tamanho são eixos independentes. Use `primary` para a ação principal, `secondary` para auxiliares e `danger` para ações destrutivas. Tamanhos `sm`, `md` e `lg` seguem o contrato de cada componente.

O Select HTML usa `.rda-select` no wrapper e `.rda-select__field` no campo nativo. Aplicar a classe do wrapper no `<select>` não desenha o controle:

```html
<div class="rda-select">
  <label class="rda-select__label" for="sort">Ordenação</label>
  <div class="rda-select__field-wrapper">
    <select id="sort" class="rda-select__field rda-select__field--md">
      <option value="name">Nome</option>
      <option value="date">Data</option>
    </select>
    <span class="rda-select__chevron" aria-hidden="true"><rda-icon name="chevron-down"></rda-icon></span>
  </div>
</div>
```

O shell opta pelo produto com `data-rda-product="unkayos"` e escolhe um preset em `data-unkay-accent="cyan|violet|blue|rose|fuchsia|teal|indigo"`. Os mesmos controles adotam a paleta inteira por herança. Atributos de produto não são novos valores de `data-color` ou de `data-style`. Erro, sucesso, aviso e membership preservam seus contratos.

Em React, a composição equivalente é:

```tsx
import '@reversodoavesso/design-system/styles';
import '@reversodoavesso/design-system/unkayos/styles';
import { Button } from '@reversodoavesso/design-system';
import { UnkayosScope } from '@reversodoavesso/design-system/unkayos';
<UnkayosScope accent="violet" theme="light">
  <Button variant="primary" styleVariant="matte">Salvar</Button>
  <Button variant="danger">Excluir</Button>
</UnkayosScope>
```

O provedor de tema/persistência da aplicação permanece responsável pela preferência do usuário. `UnkayosScope` aplica somente o escopo visual. Conteúdo que conserva a identidade padrão pode usar `data-rda-product="base"`.

## 4. Tokens e CSS do app

```css
.notes {
  display: flex;
  flex-direction: column;
  gap: var(--rda-spacing-4);
  padding: var(--rda-spacing-4);
  color: var(--rda-content-primary);
  background: var(--rda-surface-primary);
  border-radius: var(--rda-border-radius-md);
}
.notes__selection {
  color: var(--unkay-accent-on-subtle);
  background: var(--unkay-accent-subtle);
  border: 1px solid var(--unkay-accent-border);
}
```

Use tokens `--rda-*` para fundamentos e intenções semânticas. Use `--unkay-accent-*` somente para estados do produto que adotam o accent: solid/on-solid, hover, active, subtle/on-subtle, text, border e focus. Não reescreva primitivos como `--rda-color-primary-400`. Não crie versões locais de `.rda-button` ou `.rda-input`.

O runtime aplica namespace ao CSS do app. Use classes locais simples; coloque animações ou regras globais compartilhadas na camada do produto, sem depender de seletores globais no CSS do aplicativo.

## 5. Ícones oficiais em HTML e JavaScript

```html
<rda-icon name="settings" size="20"></rda-icon>
<button type="button" aria-label="Fechar">
  <rda-icon name="x"></rda-icon>
</button>
<rda-icon name="circle-check" label="Concluído"></rda-icon>
```

```javascript
import { iconMarkup } from '../../core/ui/designSystem.js';
this.$('#icon').innerHTML = iconMarkup('folder-open', { size: 24 });
```

O runtime não depende de React, busca remota ou fonte de ícones. Ele usa o mesmo catálogo SVG do componente React `Icon`. Nomes desconhecidos recebem o fallback oficial. Não use emojis como ícones de botões, navegação, estados ou apps. Emojis que façam parte do conteúdo criado pelo usuário são conteúdo, não iconografia de interface.

Ícones são decorativos por padrão. Dê nome acessível ao botão que contém apenas um ícone. `label` é reservado ao ícone que transmite informação por conta própria. O manifesto do app declara `icon_name` com um nome do catálogo; seu arquivo `icon.svg` é uma cópia do SVG oficial correspondente.

### Ícones de novos apps com IA

Procure primeiro um símbolo do catálogo. Preserve marcas próprias existentes: o navegador The Orb usa `orb-icon`, registrado como marca custom, com seu desenho original. A padronização do DS não substitui identidades por glyphs genéricos.

O Icon Studio da documentação do DS fica em `/tools/icons`: prepara o brief para o modelo de IA escolhido, valida o SVG recebido e mostra prévias em 16, 20, 24, 32 e 48 px, em claro/escuro. O comando local usa o mesmo contrato:

```powershell
npm run icon:author -- brief --name app-minhas-notas --description "Notas rápidas; folha dobrada com poucos detalhes" --out ./icon-brief.md
# Envie o brief à IA e salve o SVG retornado em ./icon.svg.
npm run icon:author -- validate --file ./icon.svg
npm run icon:author -- register --name app-minhas-notas --file ./icon.svg --ds C:/workspace/rda/rda-ds
# Gere o DS no checkout indicado, mantendo o terminal na pasta do Unkayos:
npm --prefix C:/workspace/rda/rda-ds run build
npm run sync:ds
npm run scaffold -- --id minhas-notas --icon app-minhas-notas --register
```

O registro escreve somente a fonte nova no catálogo custom do DS e recusa sobrescritas; é necessário gerar o DS antes de sincronizar. Para uma marca original existente, use `--kind brand` na validação e no registro, preservando paths, proporções e viewBox.

Novos ícones de interface usam viewBox `0 0 24 24`, `fill="none"`, `stroke="currentColor"`, espessura 2, extremos/junções arredondados e margem óptica de 2 unidades. Evite texto, emoji, sombras, gradientes e detalhes que desaparecem a 16 px. O tamanho e o accent vêm do componente consumidor. Marcas existentes têm contrato de preenchimento e geometria próprios.

As regras legíveis por agentes estão em `/design-system/rda/icons/guidelines.json`; o autor SVG e o validador são distribuídos em `/design-system/rda/tools/`. A validação bloqueia elementos/atributos ativos e recursos externos. A aceitação técnica ainda exige revisar legibilidade, originalidade e identidade antes de registrar.

## 6. Ciclo de vida e persistência

Estenda `BaseApp`; use `this.$()` e `this.$$()` para seletores locais. Registre eventos no `onRun()` e limpe listeners, sockets e recursos no `onCleanup()`. Utilize os temporizadores gerenciados da BaseApp. Nunca use um ID global para buscar elementos de outra instância.

Prefira `this.wasmFileSystem` para persistência. Suas operações são assíncronas: aguarde `mkdir`, `readFile`, `writeFile`, `readdir` e `remove`. Para confirmar uma gravação durável antes de recarregar ou fechar, aguarde também `fs.flush()` quando disponível: o Wasm VFS usa autosave com debounce de 500 ms. Só apresente sucesso após concluir essas operações. Trate erros e restaure o estado de loading/disabled. O gerador contém um exemplo completo de salvamento.

## 7. HTML gerado, segurança e acessibilidade

OpenUI sanitiza HTML e permite o elemento oficial `rda-icon`. Shadow DOM isola estilos; JavaScript nativo roda como código confiável da página. O SDK de apps valida acesso a caminhos dentro da pasta de dados do app. Recursos restritos exigem permissão e autorização do serviço; uma cor ou tier em localStorage não concede acesso.

Verifique claro e escuro, os sete presets, foco visível, teclado, rótulos, disabled/loading e feedback de erro. Não dependa só de cor para comunicar um estado. Teste janelas pequenas e múltiplas instâncias.

## 8. Verificação antes de entregar

```powershell
npm run ds:check
npm run lint
npm test
npm run build:dist
```

Execute também o app no navegador. Confirme que seus ícones vêm do catálogo, que o accent altera apenas os estados previstos, que ações destrutivas continuam identificáveis e que a gravação sobrevive a uma recarga.

## 9. Integração com o espaço e widgets

O shell oferece setup inicial, menu de apps amplo/compacto e trilha flutuante/barra de borda. A busca e a estrela usam `app_name` e `icon_name`. Opcionalmente, `short_name` oferece um nome curto para a trilha. Apps não devem alterar as preferências globais de aparência ou navegação por conta própria.

Widgets de dados são importados em Configurações → Widgets com `schema: "unkayos.widget/v1"`, identificador de 2–48 caracteres, título de até 60 caracteres, `icon` do catálogo e tipo `note` ou `links`. Uma nota tem `content` de até 1600 caracteres; links usam até oito itens `{label,url}` com HTTP/HTTPS sem credenciais. O conteúdo é renderizado como texto/links, sem código executável. O usuário revisa uma prévia e escolhe se o widget inicia com o sistema. O painel permite baixar um exemplo JSON real.

Widgets nativos locais usam `mode: "desktop_ui"` e `widget: true` no manifesto. Não use essa marcação na barra ou em serviços essenciais. O gerenciador controla início e encerramento, organiza os cards no desktop e preserva a diferença entre carregar nesta sessão e carregar ao entrar. Use temporizadores gerenciados e limpe recursos no ciclo de vida. A importação de JSON não instala módulos JavaScript de terceiros.

O fluxo completo de uso e exemplos estão em `docs/WORKSPACE.md` no checkout do Unkayos.

## 10. Padrões do workspace e distribuição

Os padrões oficiais `rda-unkay-app-card`, `rda-unkay-scroll-region` e `rda-unkay-window-progress` pertencem à camada de produto do DS (`/patterns/unkayos`). Cards compõem ActionCard com botão de fixar como irmão, sem botões aninhados. Use slots de ícone, título e descrição alinhados ao início. A rolagem fica em uma região interna com margem para os cantos do painel.

A abertura de `system_window` é gerenciada pelo sistema: linha Progress indeterminada abaixo do cabeçalho, visível apenas após 150 ms pendentes; removida imediatamente ao concluir HTML, CSS, módulo e `onRun`. Não adicione espera mínima nem um overlay próprio. `onRun` deve retornar a Promise do trabalho necessário para o app estar pronto. Falhas devem ser comunicadas; feche recursos em `onCleanup`.

Use `orb-compact` para o The Orb em 16–32 px. `orb-icon` mantém a marca original para tamanhos maiores. Nunca use imagem rasterizada para esses ícones.

A distribuição é neutra por padrão. A flag de operador `UNKAYOS_BRANDING=rda` no container habilita a marca RDA no menu, setup e informações. Ela não aparece nas preferências pessoais nem concede autenticação. Em hospedagem estática, defina somente `{ branding: 'rda' }` em `deployment.js`; remova/defina `neutral` para uso genérico. Tokens e componentes continuam os mesmos nos dois modos.

Versão e histórico têm fonte única em `releases.json`. Veja `docs/RELEASING.md` para preparar uma release sem divergência entre pacote, changelog e interface.
