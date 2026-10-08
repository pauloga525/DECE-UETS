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

# 4. Página de bienvenida por HTTP + descargas (ver deploy/nginx/dece.conf, puerto 80)
WEB_DIR="${WEB_DIR:-/var/www/dece-bienvenida}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$WEB_DIR"
cp "$SCRIPT_DIR/../bienvenida/index.html" "$WEB_DIR/index.html"
cp "$CA_DIR/$CA_NAME.crt" "$WEB_DIR/ca.crt"
# Instalador de doble clic para Windows: lleva la CA incrustada y la agrega al almacén "Raíz de
# confianza" del USUARIO actual (no pide permisos de administrador; Windows muestra su propio
# aviso de seguridad para confirmar). Chrome y Edge usan ese almacén.
{
  printf '@echo off\r\n'
  printf 'title Sistema DECE - Conexion segura\r\n'
  printf 'echo Instalando el certificado del Sistema DECE (UETS)...\r\n'
  printf 'echo Windows le preguntara si desea instalarlo: responda SI.\r\n'
  printf 'echo.\r\n'
  printf 'set "F=%%TEMP%%\\DECE-UETS-CA.crt"\r\n'
  printf '(\r\n'
  while IFS= read -r line; do printf 'echo %s\r\n' "$line"; done < "$CA_DIR/$CA_NAME.crt"
  printf ') > "%%F%%"\r\n'
  printf 'certutil -user -addstore -f Root "%%F%%" >nul\r\n'
  printf 'if errorlevel 1 (\r\n'
  printf '  echo.\r\n'
  printf '  echo No se instalo el certificado. Vuelva a intentarlo y responda SI en el aviso.\r\n'
  printf ') else (\r\n'
  printf '  echo.\r\n'
  printf '  echo LISTO. Cierre el navegador por completo y vuelva a abrir el Sistema DECE.\r\n'
  printf ')\r\n'
  printf 'del "%%F%%" >nul 2>&1\r\n'
  printf 'echo.\r\n'
  printf 'pause\r\n'
} > "$WEB_DIR/instalar-certificado-dece.cmd"
chmod 644 "$WEB_DIR"/*

echo
echo "Listo:"
echo "  Nginx:     ssl_certificate     $OUT_DIR/fullchain.crt;"
echo "             ssl_certificate_key $OUT_DIR/site.key;"
echo "  Repartir:  $OUT_DIR/$CA_NAME.crt  (instalar en cada equipo como CA raíz de confianza)"
echo "  Bienvenida: $WEB_DIR (http://$NAME) con instalador para Windows"
echo "  Recargar:  sudo nginx -t && sudo systemctl reload nginx"
