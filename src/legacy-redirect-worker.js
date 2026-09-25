const canonicalOrigin = "https://vivibureau.pp.ua";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const destination = new URL(`${incoming.pathname}${incoming.search}`, canonicalOrigin);
    return Response.redirect(destination.toString(), 301);
  }
};
