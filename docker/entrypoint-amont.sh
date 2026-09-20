#!/bin/sh
# Deduit AMONT_HOTE de API_UPSTREAM, avant que l'entrypoint de nginx
# ne substitue le template.
#
# POURQUOI. Le proxy a besoin du HOTE seul (`ws.rabbit.rip`) pour l'en-tete
# Host et le SNI, la ou API_UPSTREAM porte l'URL entiere. Le deduire ici evite
# une seconde variable a tenir en accord avec la premiere : en changer une et
# oublier l'autre donnerait un amont joint avec le mauvais nom, donc la
# mauvaise application servie — une panne silencieuse.
#
# Ce fichier vit dans /docker-entrypoint.d, que l'image nginx execute dans
# l'ordre alphabetique ; `10-` passe donc avant le `20-envsubst` qui lit la
# variable.
#
# Le nom AMONT_HOTE n'est pas cosmetique : NGINX_ENVSUBST_FILTER filtre par
# PREFIXE, donc `API_UPSTREAM` masquait `API_UPSTREAM_HOST` — jamais
# substituee, nginx refusait de demarrer sur "unknown variable".
if [ -z "${AMONT_HOTE}" ] && [ -n "${API_UPSTREAM}" ]; then
  # schema retire, puis tout ce qui suit le premier / ou :
  AMONT_HOTE=$(printf '%s' "${API_UPSTREAM}" | sed -e 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' -e 's#[/:].*$##')
  export AMONT_HOTE
fi
echo "[amont] API_UPSTREAM=${API_UPSTREAM} -> Host/SNI=${AMONT_HOTE}"
