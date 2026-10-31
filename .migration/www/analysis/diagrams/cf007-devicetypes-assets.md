# CF007 devicetypes-assets st_values staging

```mermaid
flowchart TD
  A[BUILD_WEBUI ON] --> B[BUILD_DEVICETYPES forced ON]
  B --> C[devicetypes-assets]
  C --> D[copy st_values.cgi to ROOTFS/www/config]
  C --> E[copy st_values.js to ROOTFS/www/config]
```
