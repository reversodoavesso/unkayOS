# Guia de Design Tokens - unkayOS

## Aparência e identidade RDA

Os tokens oficiais e o CSS de componentes são distribuídos em `/design-system/rda/`. O accent do produto usa o eixo `data-rda-product="unkayos"` e presets validados `cyan`, `violet` e `blue`, sem alterar primitivos de marca. Consulte o [guia prático canônico](./APP_DEVELOPMENT.md) para exemplos executáveis, distribuição, ícones e ciclo de vida. As seções abaixo documentam aliases de compatibilidade de apps antigos.

## 📋 Tokens Padronizados

### 🎨 Cores

#### Texto
- `--color-text-primary`: Texto principal (#ffffff)
- `--color-text-secondary`: Texto secundário (#cccccc)
- `--color-text-tertiary`: Texto terciário (#888888)
- `--color-text-muted`: Texto esmaecido (#666666)
- `--color-text-on-dark`: Texto em fundos escuros (#ecf0f1)
- `--color-text-on-light`: Texto em fundos claros (#2c3e50)

#### Superfícies
- `--color-surface-primary`: Superfície primária (#1e1e1e)
- `--color-surface-secondary`: Superfície secundária (#2d2d2d)
- `--color-surface-tertiary`: Superfície terciária (#3e3e3e)

#### Background
- `--color-background-primary`: Fundo primário (#1e1e1e)
- `--color-background-secondary`: Fundo secundário (#2d2d2d)

#### Bordas
- `--color-border-primary`: Borda primária (#404040)
- `--color-border-secondary`: Borda secundária (#505050)
- `--color-border-dark`: Borda escura (#34495e)
- `--color-border-light`: Borda clara (#bdc3c7)

#### Estados
- `--color-hover`: Estado hover (#4e4e4e)
- `--color-active`: Estado ativo (#5e5e5e)
- `--color-focus`: Estado foco (usa --color-primary-base)

#### Cores Específicas
- `--color-folder`: Cor para pastas (#dcb67a)
- `--color-file`: Cor para arquivos (#519aba)

### 📏 Espaçamento
- `--spacing-xs`: 4px
- `--spacing-sm`: 8px
- `--spacing-md`: 16px
- `--spacing-lg`: 24px
- `--spacing-xl`: 32px

### 🔤 Tipografia
- `--font-family-base`: 'Roboto', sans-serif
- `--font-family-mono`: 'Fira Code', 'Consolas', monospace
- `--font-size-xs`: 0.75rem (12px)
- `--font-size-sm`: 0.875rem (14px)
- `--font-size-base`: 1rem (16px)
- `--font-size-lg`: 1.125rem (18px)
- `--font-size-xl`: 1.25rem (20px)
- `--font-size-2xl`: 1.5rem (24px)

### 📐 Border Radius
- `--border-radius-sm`: 4px
- `--border-radius-md`: 8px
- `--border-radius-lg`: 12px
- `--border-radius-circle`: 50%

## ❌ Padrões Removidos

### NÃO USE mais fallbacks inline:
```css
/* ❌ EVITAR */
color: var(--color-text, #ffffff);
background: var(--color-surface, #2d2d2d);

/* ✅ USAR */
color: var(--color-text-primary);
background: var(--color-surface-secondary);
```

### NÃO USE tokens indefinidos:
```css
/* ❌ EVITAR */
--text-primary
--surface-secondary
--background-primary

/* ✅ USAR */
--color-text-primary
--color-surface-secondary
--color-background-primary
```

## 🔧 Implementação

### 1. Para Novos Aplicativos
Sempre importe o design system no CSS:
```css
/* No início do seu app.css */
@import url("/design-system/styles/main.css");

.meu-componente {
    color: var(--color-text-primary);
    background: var(--color-surface-secondary);
    padding: var(--spacing-md);
}
```

### 2. Para Aplicativos Existentes
1. Substitua todos os fallbacks inline
2. Use apenas tokens centralizados
3. Teste a aparência visual

### 3. Adicionando Novos Tokens
Se precisar de um novo token:
1. Adicione em `/design-system/styles/tokens.css`
2. Documente neste arquivo
3. Use naming consistente: `--color-*`, `--spacing-*`, etc.

## 🎯 Benefícios

- ✅ Aparência visual consistente
- ✅ Fácil manutenção temática
- ✅ Mudanças globais com um toque
- ✅ Melhor organização do código
- ✅ Redução de duplicação de estilos

## 🔍 Verificação

Para verificar se um app está seguindo os padrões:
```bash
# Procurar por fallbacks restantes
grep -r "var(--[^,)]*,[^)]*)" apps/*/style.css
```

Se este comando retornar resultados, ainda há fallbacks para remover.
