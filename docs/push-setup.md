# Notificações com o app fechado: passo a passo do dono

O app Android avisa quando alguém que você segue posta e quando alguém te manda mensagem
(mensagens seguidas da mesma pessoa viram um aviso só). Funciona com o app fechado e com o
celular bloqueado. O site no navegador não muda nada.

Como funciona: o celular guarda o token dele na tabela `push_devices`. Quando entra um post ou
uma mensagem, um gatilho do banco chama a Edge Function `push-notify`, que descobre quem recebe
e manda pelo Firebase Cloud Messaging (FCM). As chaves do Firebase ficam só nos segredos da função.

Faça na ordem. Leva uns 20 minutos.

## 1. Firebase

1. Abra <https://console.firebase.google.com> e clique em **Criar projeto** (nome sugerido:
   `rede-de-musica`). O Google Analytics pode ficar desligado.
2. Na página do projeto, clique no ícone do **Android** para adicionar um app.
   - Nome do pacote: `app.redemusica.semnome` (tem que ser exatamente esse)
   - Apelido: `rede de música` (opcional). O SHA-1 pode ficar em branco.
3. Clique em **Registrar app** e baixe o **google-services.json**. Pule os outros passos do assistente.
4. Engrenagem → **Configurações do projeto** → aba **Contas de serviço** → **Gerar nova chave privada**.
   Baixa um arquivo `.json`. **Ele é secreto**: não mande para ninguém e não coloque no repositório.

## 2. google-services.json como secret do GitHub

O arquivo não vai para o git (está no `.gitignore`). O GitHub Actions o recria a partir de um secret.

Gere o texto em base64. No **PowerShell**, na pasta onde o arquivo está:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\google-services.json")) | Set-Clipboard
```

No **Git Bash**:

```bash
base64 -w0 google-services.json | clip
```

No GitHub: repositório → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
- Nome: `GOOGLE_SERVICES_JSON_BASE64`
- Valor: cole (Ctrl+V)

Sem esse secret o APK continua sendo gerado, só que sem notificações.

Para gerar o APK no seu computador, copie o arquivo para `android/app/google-services.json`.

## 3. Um segredo para o banco falar com a função

Invente um texto longo e aleatório. Ele vai em dois lugares (passos 4 e 6).

PowerShell:

```powershell
[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

Git Bash:

```bash
openssl rand -hex 32
```

## 4. Edge Function `push-notify`

**Pelo painel** (sem instalar nada):

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nome: `push-notify`. Apague o código de exemplo e cole todo o conteúdo de
   `supabase/functions/push-notify/index.ts`. Clique em **Deploy function**.
3. Na função → **Details** (ou **Settings**): **desligue** “Verify JWT with legacy secret” / “Enforce JWT
   verification” e salve. Quem chama a função é o banco, que se identifica pelo cabeçalho `x-push-secret`.
4. **Edge Functions** → **Secrets** → adicione:
   - `FIREBASE_SERVICE_ACCOUNT`: abra o `.json` da conta de serviço (passo 1.4) num editor de
     texto e cole **o arquivo inteiro**, de `{` até `}`.
   - `PUSH_WEBHOOK_SECRET`: o texto do passo 3.

   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem em toda função; não precisa criar.

**Pelo terminal** (alternativa, com o Supabase CLI):

```bash
npx supabase login
npx supabase link --project-ref SEU_REF
npx supabase functions deploy push-notify --no-verify-jwt
npx supabase secrets set PUSH_WEBHOOK_SECRET=o_texto_do_passo_3
npx supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat caminho/da/conta-de-servico.json)"
```

O `SEU_REF` é o código na URL do projeto: `https://SEU_REF.supabase.co`.

## 5. SQL

No **SQL Editor**, cole e rode `supabase/015_push.sql` inteiro. Ele cria a tabela dos aparelhos,
a tabela que evita aviso repetido e os gatilhos em `posts` e `messages`. Pode rodar de novo.

## 6. Ligar o gatilho à função (Vault)

O gatilho lê a URL da função e o segredo do Vault do Supabase. Enquanto eles não existirem,
o gatilho não faz nada (posts e mensagens continuam funcionando normalmente).

No **SQL Editor**, troque `SEU_REF` e o segredo e rode:

```sql
select vault.create_secret('https://SEU_REF.supabase.co/functions/v1/push-notify', 'push_notify_url');
select vault.create_secret('o_texto_do_passo_3', 'push_notify_secret');
```

Para trocar depois (por exemplo, um segredo novo):

```sql
select vault.update_secret(id, 'novo_texto') from vault.secrets where name = 'push_notify_secret';
```

Não precisa criar Database Webhook no painel: o `015_push.sql` já faz esse papel, mandando só os
ids do post ou da mensagem (o conteúdo das mensagens não sai do banco pelo webhook).

## 7. Testar

1. Faça um push na `main` para o GitHub gerar o APK novo (já com o `google-services.json`).
2. Instale, abra e entre na sua conta. O app pede permissão para notificações: aceite.
3. Com outra conta (no navegador), mande uma mensagem para você. Feche o app e bloqueie o celular.
   O aviso “Fulano mandou mensagem” deve chegar. Mande mais duas: continua um aviso só.
4. Tocar no aviso abre a conversa. Para posts: siga a outra conta e poste com ela.

Os botões “Posts de quem você segue” e “Mensagens” ficam em **Exibição → Avisos no celular**
(só aparecem no app).

Se nada chegar:
- **Edge Functions → push-notify → Logs**: `401` é segredo diferente entre o Vault e
  `PUSH_WEBHOOK_SECRET`; `oauth 400` é `FIREBASE_SERVICE_ACCOUNT` incompleto.
- No SQL Editor, `select * from push_devices;` deve mostrar uma linha por celular logado.
  Sem linha: o APK foi gerado sem o secret `GOOGLE_SERVICES_JSON_BASE64`, ou a permissão foi negada
  (libere em Configurações do Android → Apps → rede de música → Notificações).
- `select * from net._http_response order by created desc limit 5;` mostra as chamadas do gatilho.
