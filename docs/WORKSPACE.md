# Seu espaço no Unkayos

O primeiro acesso oferece quatro etapas: nome local e conta RDA opcional, aparência, navegação e widgets. As escolhas são salvas no VFS e no cache deste dispositivo. O nome de boas-vindas é uma preferência local; a identidade autenticada continua vindo do SSO. Entrar não é obrigatório para preparar o espaço.

O setup pode ser reaberto em **Configurações → Meu espaço → Reabrir boas-vindas**. A prévia de aparência é aplicada na hora; Escape fecha e restaura as preferências salvas. “Pular por enquanto” conclui com as escolhas atuais.

## Apps e navegação

- **Trilha flutuante**: atalhos e janelas em curso numa faixa leve, afastada das bordas.
- **Barra de borda**: a mesma navegação alinhada ao limite da tela.
- **Painel amplo**: busca, categorias, favoritos e descrições dos apps.
- **Lista compacta**: resultados em uma coluna, para navegação direta.

As quatro combinações estão disponíveis em **Configurações → Meu espaço**. A barra mostra só ícones por padrão; ative **Mostrar nomes na barra** para exibir os rótulos. Os nomes continuam disponíveis nos tooltips e na acessibilidade. Posição superior/inferior e ocultação automática continuam em **Janelas & Desktop**. Janelas maximizadas e encaixadas respeitam a área reservada pela barra.

**Ctrl + Espaço** abre ou fecha os apps; **Esc** fecha o painel e devolve o foco. Na busca, seta para baixo entra nos resultados. Nos resultados, use as setas, Home/End e Enter. A estrela fixa ou remove um app da trilha; até oito favoritos são guardados. Ao abrir um app que já está em curso, o shell restaura e foca a janela existente.

## Widgets

Em **Configurações → Widgets**:

- **Carregar/Ocultar** controla a sessão atual e encerra os recursos do widget ao ocultar.
- **Ao entrar** define os widgets que serão carregados no próximo acesso.
- Desativar o conjunto encerra os widgets atuais e preserva a lista de início. Reativar carrega essa lista.
- O X no cabeçalho de um widget oculta somente naquela sessão.

Relógio e informações do sistema são widgets nativos. É possível importar até 12 widgets declarativos de notas e links. Baixe um exemplo no painel, adapte o JSON, selecione o arquivo e confira a prévia. A opção de início é escolhida antes de adicionar. Remover um widget importado apaga sua configuração do espaço, sem modificar o arquivo JSON original.

```json
{
  "schema": "unkayos.widget/v1",
  "id": "em-foco",
  "title": "Em foco",
  "icon": "bookmark",
  "type": "note",
  "content": "Uma ideia por vez.\nUm passo à frente."
}
```

Uma coleção usa `"type": "links"` e `"items": [{"label": "RDA", "url": "https://reversodoavesso.com"}]`. URLs são HTTP/HTTPS e abrem em uma nova aba. Notas são texto simples. Os ícones usam nomes do catálogo oficial do DS. O formato de importação não executa HTML, CSS ou JavaScript.

Para um widget nativo desenvolvido no repositório, registre o app com `mode: "desktop_ui"` e `widget: true`. O gerenciador passa a controlar sua inicialização e encerramento; use os temporizadores da BaseApp e limpe recursos em `onCleanup`. A barra de sistema continua protegida contra encerramento.

## Direção visual

O shell usa tipografia, cor e composição do RDA DS para criar sua identidade: painel editorial, trilha com ícones e nomes, informação em uma faixa de widgets e controles neutros nas janelas. O accent acompanha foco, seleção e ações do produto. Marca, feedback e níveis de acesso mantêm seus contratos.

As preferências ficam em `/etc/unkay-settings.json`. Atualizações são serializadas e aplicadas por seção, para uma alteração de aparência não apagar favoritos ou widgets recém-configurados.

## Imagens e cores do espaço

A coleção Intervalos reúne sete imagens, além dos fundos Atmosfera, Nebulosa e Obsidian. Imagens da coleção podem acompanhar o destaque e o tema; imagens personalizadas existentes preservam suas cores até você escolher a adaptação. Compare original e ajustada antes de confirmar. É possível carregar um arquivo de até 20 MB ou indicar um caminho de imagem no VFS.

Em Ajustes de cor, escolha automático ou personalize distribuição, luminosidade, intensidade, saturação e suavidade. O processamento é local. Imagens externas precisam permitir leitura pelo navegador para adaptação; a imagem original continua sendo a alternativa quando isso não é possível.

As paletas são geradas a partir dos tokens oficiais do DS. O kernel Wasm e o fallback JavaScript usam o mesmo algoritmo de cor e são comparados em testes. O cache considera a imagem inteira e os parâmetros escolhidos; a restauração inicial não reutiliza pixels de uma configuração diferente. A antiga preferência Montanhas migra para Horizonte Limpo.
