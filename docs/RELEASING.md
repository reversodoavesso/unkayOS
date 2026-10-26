# Releases do unkayOS

`releases.json` é a fonte única. O contador começa em 1 na versão 2.0.0-alpha.2; não representa lançamentos anteriores à adoção do histórico. O número é incrementado uma vez por release, independentemente do número de builds.

Prepare a próxima release antes do commit:

```sh
npm run release:prepare -- --version 2.0.0-alpha.3 --title "Título da release" --note "Mudança visível" --note "Correção"
npm run release:check
npm test
npm run lint
npm run build:dist
```

`release:prepare` incrementa o contador e sincroniza package.json, lockfile, core/release-info.js, public/release.json e CHANGELOG.md. Versões repetidas e histórico inconsistente são recusados. `release:check` no build recusa artefatos divergentes. Para corrigir somente os arquivos gerados, use `release:sync`.

Após o commit, o build registra a revisão Git e a data em `build-info.json`. Em Docker/CI sem .git, passe `--build-arg UNKAYOS_REVISION=<commit completo>`. Rebuild da mesma versão mantém o contador e recebe sua própria data/revisão. Sobre, Configurações e widget leem os mesmos metadados; a interface só exibe a revisão se corresponder à versão instalada.

O container é neutro por padrão. Em implantação RDA, use `UNKAYOS_BRANDING=rda`; em outros ambientes omita a variável ou use `neutral`. A flag é aplicada no início do container, sem rebuild e sem inferir marca pelo domínio.

Valide primeiro a imagem candidata em porta local temporária. Atualize somente o serviço unkayOS. Preserve a imagem e a configuração anteriores para rollback; valide /health, /release.json, /build-info.json e os fluxos básicos no domínio público após o deploy.
