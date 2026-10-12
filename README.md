# AeroMind

Prototipo demostrativo de AeroMind, un emprendimiento simulado para la materia Emprendimiento: música relajante, respiración guiada y una guía sencilla de cada fase del vuelo, en una aplicación web progresiva (PWA) que funciona sin internet.

No cobra, no pide registro y no guarda datos personales.

## Probar en la computadora

```bash
python -m http.server 8080 --directory public
```

Abrir <http://localhost:8080>. En `localhost` funcionan la instalación y el modo sin internet.

## Publicar en Netlify

El sitio es estático y no necesita compilación: `netlify.toml` indica que se publica la carpeta `public`.
