# Abertura de aplicativos

`AppManager` mantém o recurso `boot` pendente até `UI.ready`, que conclui o carregamento de HTML/CSS, módulo JavaScript e `onRun`. JS e conteúdo podem carregar em paralelo. A janela fica disponível para fechar enquanto abre; fechar cancela o indicador e evita renderização tardia.

`LoadingUI.attach` insere o Progress indeterminado oficial do DS entre cabeçalho e conteúdo. Ele começa oculto e só fica visível após 150 ms de trabalho pendente. Esse timer controla apenas a apresentação. Não atrasa `onRun`, não bloqueia conteúdo e não mantém uma animação de conclusão. Apps rápidos não exibem uma piscada de loading. Não é exibido percentual estimado.

`LoadingManager` continua registrando recursos e métricas. Conclusão e erro publicam eventos imediatamente. O estado e os timers do indicador são liberados ao concluir, falhar ou fechar. `LazyResourceLoader` mantém a preparação e o carregamento de recursos. O DS respeita `prefers-reduced-motion`.

Para apps nativos, retorne de `onRun` a Promise do trabalho necessário para uso. Para tarefas posteriores à abertura, use o Progress ou Spinner oficial no contexto da própria tarefa; não reinicie o indicador global da janela.
