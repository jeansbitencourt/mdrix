# Mdrix

Editor Markdown para desktop Linux, focado em abrir um documento individual, alternar entre leitura e edição e salvar no próprio arquivo. Não depende de vault, banco de dados ou serviço de rede para renderizar conteúdo.

## Arquitetura

O app usa Tauri 2, Rust, React e TypeScript. A interface é uma SPA servida no WebView do sistema; o núcleo Rust cuida da integração desktop e das operações de arquivos, chamadas pelo frontend através dos comandos Tauri. No Linux, o WebView é fornecido pelo WebKitGTK.

Essa é a arquitetura padrão prevista pelo Tauri: [visão geral da arquitetura](https://v2.tauri.app/concept/architecture/), [comandos frontend/Rust](https://v2.tauri.app/develop/calling-rust/) e [configuração de frontend](https://v2.tauri.app/start/frontend/). A documentação do Tauri recomenda Vite para aplicações SPA, como a interface deste projeto.

## Desenvolvimento

Requisitos: Rust stable, Node.js com npm, WebKitGTK 4.1 e as ferramentas nativas de compilação do Tauri para Linux.

Na raiz do repositório:

- Instale as dependências web: `npm install`
- Inicie o app em desenvolvimento: `npm run tauri dev`
- Abra uma fixture local: `npm run tauri dev -- -- -- fixtures/01-basic.md`
- Gere o frontend: `npm run build`
- Gere o executável Tauri sem pacote de distribuição: `npm run tauri build -- --no-bundle`

O app também abre documentos pela interface ou com Ctrl+O e salva com Ctrl+S.

## Estrutura

- `src/app`: estado da aplicação e ciclo de vida do documento.
- `src/components`: componentes compartilhados da interface.
- `src/markdown`: renderização de Markdown, matemática, diagramas e imagens locais.
- `src/styles`: tema e layout.
- `src-tauri/src/commands`: operações de documento, imagens locais e links externos.
- `src-tauri/src/state.rs`: estado de inicialização do app.

## Documentos grandes

Leitura e salvamento de arquivos usam `spawn_blocking` no núcleo Rust para manter o runtime do Tauri livre. Para documentos com 128 KiB ou mais, um Web Worker faz o parse e os plugins Markdown; a interface recebe os blocos em lotes e virtualiza os que estão fora da área visível. O editor e o leitor são montados sob demanda, e a interface mostra o andamento da leitura e da preparação do Markdown.

Esse fluxo reduz o trabalho síncrono no WebView, mas ainda precisa ser validado com as fixtures locais antes de distribuir o app. Confira renderização de Markdown, Mermaid, matemática, imagens locais, rolagem, troca entre leitura e edição e edição sem perda de conteúdo.

## Recursos locais de validação

As pastas `fixtures/` e `scripts/` permanecem disponíveis na cópia de desenvolvimento para validação manual e geração de documentos grandes. São ignoradas pelo Git e não fazem parte do repositório; uma cópia recém-clonada não as inclui.
