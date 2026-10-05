#!/usr/bin/env bash
# Certificado HTTPS para publicar el Sistema DECE en la red local (sin Let's Encrypt).
#
# Crea (una sola vez) una CA interna "DECE-UETS-CA" y con ella firma el certificado del sitio.
# Cada equipo de la red instala UNA vez la CA (DECE-UETS-CA.crt) y desde ahí el navegador
# confía en el sitio sin advertencias. Ver docs/guia-despliegue.md, sección 3.5.
#
# Uso (en el servidor):
#   sudo bash deploy/certs/generar-certificados.sh dece.192-168-200-31.nip.io [192.168.200.31]
#
# Volver a correrlo renueva el certificado del sitio con la MISMA CA (los equipos no tienen que
# reinstalar nada). La clave de la CA queda en $CA_DIR con permisos 600: no copiarla a ningún
# otro lado ni subirla al repositorio.
set -euo pipefail

NAME="${1:?Uso: $0 <nombre> [ip]   p. ej. $0 dece.192-168-200-31.nip.io 192.168.200.31}"
# Si no se pasa la IP, se toma del nombre nip.io (192-168-200-31 → 192.168.200.31).
IP="${2:-$(echo "$NAME" | grep -oE '[0-9]+-[0-9]+-[0-9]+-[0-9]+' | tr '-' '.' || true)}"
CA_DIR="${CA_DIR:-/etc/dece-ca}"
OUT_DIR="${OUT_DIR:-/etc/nginx/certs/dece}"
CA_NAME="DECE-UETS-CA"
DAYS_SITE=825 # máximo que aceptan Chrome/Safari para CAs privadas

mkdir -p "$CA_DIR" "$OUT_DIR"
chmod 700 "$CA_DIR"

# 1. CA interna (solo si no existe)
if [[ ! -f "$CA_DIR/$CA_NAME.key" ]]; then
  echo "→ Creando la CA interna $CA_NAME (10 años)"
  openssl genrsa -out "$CA_DIR/$CA_NAME.key" 4096
  chmod 600 "$CA_DIR/$CA_NAME.key"
  openssl req -x509 -new -key "$CA_DIR/$CA_NAME.key" -sha256 -days 3650 \
    -subj "/C=EC/O=Unidad Educativa Tecnico Salesiano/OU=DECE/CN=$CA_NAME" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "$CA_DIR/$CA_NAME.crt"
else
  echo "→ Usando la CA existente en $CA_DIR"
fi

# 2. Certificado del sitio
SAN="DNS:$NAME"
[[ -n "$IP" ]] && SAN="$SAN,IP:$IP"
echo "→ Emitiendo el certificado de $NAME ($SAN), válido $DAYS_SITE días"
openssl genrsa -out "$OUT_DIR/site.key" 2048
chmod 600 "$OUT_DIR/site.key"
openssl req -new -key "$OUT_DIR/site.key" -subj "/O=UETS/OU=DECE/CN=$NAME" -out "$OUT_DIR/site.csr"
EXT="$(mktemp)"
cat > "$EXT" <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$SAN
EOF
openssl x509 -req -in "$OUT_DIR/site.csr" -CA "$CA_DIR/$CA_NAME.crt" -CAkey "$CA_DIR/$CA_NAME.key" \
  -CAcreateserial -days "$DAYS_SITE" -sha256 -extfile "$EXT" -out "$OUT_DIR/site.crt"
rm -f "$EXT" "$OUT_DIR/site.csr"
# Cadena completa para Nginx (sitio + CA).
cat "$OUT_DIR/site.crt" "$CA_DIR/$CA_NAME.crt" > "$OUT_DIR/fullchain.crt"

# 3. Copia PÚBLICA de la CA para repartir a los equipos de la red
cp "$CA_DIR/$CA_NAME.crt" "$OUT_DIR/$CA_NAME.crt"
chmod 644 "$OUT_DIR/$CA_NAME.crt" "$OUT_DIR/fullchain.crt"

echo
echo "Listo:"
echo "  Nginx:     ssl_certificate     $OUT_DIR/fullchain.crt;"
echo "             ssl_certificate_key $OUT_DIR/site.key;"
echo "  Repartir:  $OUT_DIR/$CA_NAME.crt  (instalar en cada equipo como CA raíz de confianza)"
echo "  Recargar:  sudo nginx -t && sudo systemctl reload nginx"
