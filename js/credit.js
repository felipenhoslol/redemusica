// Author credit shown at the end of the right column, the phone "você" sheet and the login screen.

export function creditHtml(className = '') {
  const year = new Date().getFullYear();
  return `<p class="site-credit${className ? ' ' + className : ''}">© ${year} rede de música · feito por <strong>felipenhos</strong>
    <span class="site-links"><a href="faq.html">Perguntas frequentes</a> <a href="privacidade.html">Privacidade</a> <a href="termos.html">Termos</a></span></p>`;
}
