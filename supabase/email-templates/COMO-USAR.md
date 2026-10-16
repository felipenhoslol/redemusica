# E-mails com a cara do app

O Supabase envia os e-mails de cadastro, de senha e de troca de e-mail a partir de modelos configurados no painel.
Estes arquivos são esses modelos, com o gatinho e as cores do app.

## Onde colar

No painel do Supabase: **Authentication → Emails → Templates** (em versões antigas, *Email Templates*).

| Modelo no painel        | Assunto                                   | Corpo (copie o arquivo inteiro)  |
|-------------------------|-------------------------------------------|----------------------------------|
| **Confirm signup**      | `Confirme seu e-mail na rede de música`   | `confirm-signup.html`            |
| **Reset password**      | `Crie uma nova senha na rede de música`   | `reset-password.html`            |
| **Change Email Address** | `Confirme seu novo e-mail na rede de música` | `change-email.html`           |
| **Magic Link**          | `Confirme seu e-mail na rede de música`   | `magic-link.html`                |

Salve cada um. O próximo cadastro ou pedido de senha já usa o modelo novo.

## Antes de testar

- **URL do site**: em *Authentication → URL Configuration*, deixe `https://felipenhoslol.github.io/redemusica/`
  como *Site URL* e também em *Redirect URLs*. Sem isso o botão do e-mail leva para `localhost`.
- **Logo**: os modelos usam `https://felipenhoslol.github.io/redemusica/assets/icon-192.png`, que só existe
  depois que o site é publicado com a pasta `assets/`.

## Remetente (opcional)

Pelo servidor de e-mail padrão do Supabase, o remetente aparece como `Supabase Auth` e há um limite baixo
de envios por hora. Para mostrar "rede de música" como remetente e enviar sem esse limite, configure um
SMTP próprio em *Authentication → Emails → SMTP Settings* (Resend, Brevo e outros têm plano grátis).

## Troca de e-mail

Em *Authentication → Providers → Email*, a opção **Secure email change** (ligada por padrão) faz o Supabase
mandar a confirmação para o e-mail antigo **e** para o novo: a troca só vale depois que os dois links forem abertos.
Desligada, basta confirmar no e-mail novo.

## Entrar sem confirmar o e-mail

1. Rode `supabase/008_email_verified.sql` no SQL Editor.
2. Em *Authentication → Providers → Email* (ou *Sign In / Providers*), desligue **Confirm email**.

Quem se cadastra passa a entrar direto. Enquanto não confirmar, aparece um lembrete nas notificações com o
botão "Enviar link de confirmação": ele manda o modelo **Magic Link**, e abrir esse link confirma o e-mail.
