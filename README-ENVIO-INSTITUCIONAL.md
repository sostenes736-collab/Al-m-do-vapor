# Além do Vapor — ativação do envio institucional

## O que foi preparado

- O site continua hospedado no GitHub Pages.
- O formulário não solicita nome, e-mail, turma, telefone ou anexos.
- O envio passa por um Cloudflare Worker, com validação de origem, limites de tamanho e Cloudflare Turnstile.
- O Worker envia o relato para um único endereço institucional definido como segredo no servidor.
- O conteúdo não é gravado em banco de dados pelo Worker. O serviço de e-mail ainda poderá manter a mensagem conforme suas próprias políticas.
- O formulário fica DESATIVADO até configurar o endpoint e a chave pública do Turnstile no `script.js`.

## Antes de ativar

1. Obter autorização formal da escola para receber relatos por e-mail.
2. A escola deve designar uma caixa institucional e pessoas responsáveis por acessá-la, além de definir triagem, encaminhamento, prazo de resposta e retenção das mensagens.
3. Informar aos estudantes que o formulário não pede identificação, mas não garante anonimato absoluto: GitHub Pages, Cloudflare, Turnstile e o provedor de e-mail podem processar metadados técnicos, como IP, horário e dados de segurança.
4. Não usar o canal para emergências. O site já orienta a procurar imediatamente um adulto de confiança ou a equipe gestora em situações de risco.

## Configuração do backend

### 1. Cloudflare Worker

- Criar uma conta Cloudflare e um Worker chamado `alem-do-vapor-relatos`.
- Publicar `worker.js` e `wrangler.toml` deste pacote (ou criar o Worker pelo Wrangler).
- O endereço ficará semelhante a `https://alem-do-vapor-relatos.<seu-subdominio>.workers.dev`.
- No ambiente do Worker, criar os seguintes segredos:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RECIPIENT_EMAIL
npx wrangler secret put FROM_EMAIL
```

`RECIPIENT_EMAIL` deve ser a caixa institucional aprovada pela escola. `FROM_EMAIL` deve ser um remetente de domínio previamente verificado no Resend. Nunca colocar essas chaves no HTML, JavaScript público ou repositório.

### 2. Turnstile

- Criar um widget Cloudflare Turnstile para o hostname `sostenes736-collab.github.io`.
- Guardar a **site key** (pública) para a configuração do site e a **secret key** somente como segredo do Worker (`TURNSTILE_SECRET_KEY`).
- A verificação é feita no servidor; não confiar apenas no navegador.

### 3. Proteção contra abuso

No painel Cloudflare, aplicar uma regra de rate limiting ao hostname do Worker, na rota `/submit` (por exemplo, limitar tentativas por IP em uma janela curta, ajustando o limite conforme o uso real). Manter Turnstile ativo. Não registrar o corpo das solicitações em logs de diagnóstico.

### 4. Configurar o site

No `script.js`, localizar o bloco `Envio institucional` e preencher:

```js
const API_ENDPOINT='https://SEU-WORKER.workers.dev/submit';
const TURNSTILE_SITE_KEY='SUA_SITE_KEY_PUBLICA';
```

Substituir os valores de exemplo pelos dados reais. Publicar os arquivos atualizados no repositório do GitHub Pages. Sem esses valores, o botão permanece desativado.

## Testes antes de divulgar

- Testar com conteúdo fictício, nunca com relato real de estudante.
- Confirmar que uma origem diferente do site é rejeitada.
- Confirmar que o envio sem Turnstile é rejeitado.
- Confirmar que o e-mail chega apenas à caixa autorizada.
- Confirmar que o site só mostra sucesso após o provedor confirmar o envio.
- Verificar se o limite contra abuso está ativo.

## Limitações importantes

- “Sem campo de identificação” não equivale a anonimato garantido. Serviços de hospedagem, segurança e e-mail podem processar metadados técnicos.
- O e-mail recebido pode conter detalhes que identifiquem alguém. O formulário orienta não inserir nomes, turmas, contatos, fotos ou dados pessoais.
- Não existe painel de acompanhamento, protocolo individual ou armazenamento próprio nesta versão.
- O Worker não encaminha automaticamente para gestores diferentes: a equipe institucional autorizada faz a triagem conforme o protocolo da escola.
- Não ativar o canal em produção antes da autorização da instituição e da definição dos responsáveis.
