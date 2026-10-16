# E-mails com a cara do app

O Supabase envia os e-mails de cadastro e de senha a partir de modelos configurados no painel.
Estes arquivos são esses modelos, com o gatinho e as cores do app.

## Onde colar

No painel do Supabase: **Authentication → Emails → Templates** (em versões antigas, *Email Templates*).

| Modelo no painel        | Assunto                                   | Corpo (copie o arquivo inteiro)  |
|-------------------------|-------------------------------------------|----------------------------------|
| **Confirm signup**      | `Confirme seu e-mail na rede de música`   | `confirm-signup.html`            |
| **Reset password**      | `Crie uma nova senha na rede de música`   | `reset-password.html`            |

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
