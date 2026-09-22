# Moodle Mapper

Extensão de navegador (Chrome/Edge, Manifest V3) que percorre uma lista de IDs de
curso do Moodle, mapeia tópicos e recursos de cada curso e exporta tudo para uma
planilha `.xlsx`.

## Como instalar

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta deste repositório.

## Como usar

1. Faça login no seu Moodle em uma aba do navegador.
2. Com essa aba ativa, abra o popup da extensão.
3. Cole os IDs dos cursos (um por linha, ou separados por vírgula/espaço —
   URLs completas com `?id=` também funcionam).
4. Opcionalmente informe a **Base do Moodle** (ex.: `https://seu-moodle.com`).
   Se ficar vazio, a origem da aba ativa é usada.
5. Clique em **Mapear e gerar .xlsx**.

O arquivo é baixado como `moodle-mapa-AAAA-MM-DD.xlsx`.

## Colunas da planilha

| Coluna | Origem |
| --- | --- |
| ID do Curso | ID informado |
| Nome Curto | `course/edit.php` (requer permissão de edição) |
| Nome do Curso | `course/view.php` |
| Categoria | `course/edit.php`, com fallback para o breadcrumb |
| Tópico | nome da seção |
| Recurso | nome da atividade/recurso |
| Tipo | classe `modtype_*` ou ícone do módulo |
| Link | URL da atividade |

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `manifest.json` | Manifest V3 da extensão |
| `popup.html` | UI do popup |
| `popup.js` | Orquestra o fetch dos cursos, monta as linhas e gera o `.xlsx` |
| `parser.js` | Extrai curso, categoria, tópicos e recursos do HTML do Moodle |
| `xlsx.full.min.js` | Biblioteca SheetJS (vendorizada) |

`parser.js` funciona tanto no navegador (`window.MoodleMapperParser`) quanto no
Node com jsdom (`module.exports`), desde que receba um `Document` — o que
permite testar o parsing sem abrir o navegador.

## Observações

- As requisições usam `credentials: "include"`, ou seja, a sessão do Moodle já
  aberta no navegador. Nada de usuário/senha é armazenado.
- Há uma pausa de 350 ms entre cursos para não sobrecarregar o servidor.
- Sem permissão de edição no curso, **Nome Curto** fica vazio e a categoria cai
  para o breadcrumb; o resumo no popup informa quantos cursos ficaram assim.
