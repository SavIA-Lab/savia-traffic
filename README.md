# SavIA-Lab · Traffic

Sistema de monitoreo y análisis de uso de infraestructura tecnológica de **SavIA-Lab**.

`savia-traffic` centraliza la recolección de métricas provenientes de los equipos y servicios del laboratorio para facilitar el análisis del uso de recursos, comportamiento de la infraestructura y disponibilidad de los sistemas.

---

## Propósito

El sistema busca proporcionar una visión centralizada del estado y utilización de la infraestructura de SavIA-Lab.

Entre las métricas de interés se encuentran:

- Tráfico de red.
- Consumo de CPU.
- Uso de GPU.
- Memoria RAM.
- Almacenamiento.
- Disponibilidad de equipos.
- Actividad y utilización de recursos.
- Información temporal para análisis histórico.

> El objetivo es convertir datos de infraestructura en información útil para la operación, planificación y análisis del laboratorio.

---

## Arquitectura

El sistema está diseñado bajo una arquitectura distribuida:

```text
┌──────────────────┐
│ Equipo SavIA-Lab │
│                  │
│ ┌──────────────┐ │
│ │     Agent    │ │
│ └──────┬───────┘ │
└─────────┼────────┘
          │
          │ Métricas
          ▼
┌─────────────────────┐
│     Collector       │
│ Recolección central │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Storage        │
│ Datos históricos    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     Processing      │
│ Limpieza / análisis │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Dashboard      │
│ Visualización       │
└─────────────────────┘
```

---

## 📊 Métricas

### Sistema

| Métrica | Descripción                    |
| ------- | ------------------------------ |
| CPU     | Porcentaje de utilización      |
| RAM     | Memoria utilizada y disponible |
| GPU     | Utilización y memoria          |
| Storage | Espacio utilizado y disponible |
| Uptime  | Tiempo de actividad            |

### Red

| Métrica    | Descripción                |
| ---------- | -------------------------- |
| Download   | Datos recibidos            |
| Upload     | Datos enviados             |
| Throughput | Velocidad de transferencia |
| Packets    | Paquetes transmitidos      |
| Errors     | Errores de red             |

### Disponibilidad

- Estado del equipo.
- Última comunicación.
- Tiempo sin reportar.
- Estado del agente.

---

## 🖥️ Agente

Cada equipo puede ejecutar un agente ligero encargado de recopilar periódicamente las métricas locales.

```text
Equipo
   │
   ├── CPU
   ├── RAM
   ├── GPU
   ├── Storage
   └── Network
        │
        ▼
     Agent
        │
        ▼
   Collector API
```

El agente debe:

- ejecutarse automáticamente;
- consumir pocos recursos;
- enviar únicamente las métricas necesarias;
- identificar el equipo mediante un identificador único;
- manejar temporalmente la pérdida de conexión;
- registrar errores localmente.

---

## 🗄️ Datos

Cada medición debe incluir como mínimo:

```json
{
  "timestamp": "2026-09-29T10:00:00Z",
  "device_id": "INF-001",
  "cpu_usage": 42.5,
  "ram_usage": 68.2,
  "gpu_usage": 73.1,
  "network_rx": 125034,
  "network_tx": 45123
}
```

La estructura definitiva de los datos debe definirse antes de implementar el almacenamiento.

---

## 📈 Dashboard

El dashboard permitirá consultar información en diferentes escalas temporales:

```text
Tiempo real
     │
     ├── Estado actual
     ├── Equipos activos
     └── Recursos utilizados

Histórico
     │
     ├── Día
     ├── Semana
     ├── Mes
     └── Periodos personalizados
```

Algunas visualizaciones previstas:

- utilización de CPU;
- utilización de GPU;
- memoria;
- tráfico de entrada y salida;
- disponibilidad de equipos;
- evolución temporal;
- comparación entre equipos;
- consumo acumulado;
- identificación de periodos de alta utilización.

---

## 🔐 Seguridad

El sistema debe considerar:

- autenticación de agentes;
- comunicación cifrada;
- control de acceso al dashboard;
- validación de datos recibidos;
- protección de credenciales;
- separación entre datos operativos y datos sensibles.

No deben almacenarse credenciales, contraseñas o claves privadas en este repositorio.

---

## 📁 Estructura propuesta

```text
savia-traffic/
│
├── README.md
├── pyproject.toml
│
├── agent/
│   ├── collector.py
│   ├── metrics.py
│   └── config.py
│
├── server/
│   ├── api/
│   ├── ingestion/
│   └── processing/
│
├── dashboard/
│
├── schemas/
│   └── metrics.yaml
│
├── config/
│
├── scripts/
│
├── tests/
│
└── docs/
    ├── architecture.md
    ├── deployment.md
    └── metrics.md
```

---

## Desarrollo

El desarrollo se divide en componentes independientes:

1. **Agent** — recopilación local.
2. **Collector** — recepción de métricas.
3. **Storage** — almacenamiento histórico.
4. **Processing** — procesamiento y agregación.
5. **Dashboard** — visualización.
6. **Monitoring** — estado del propio sistema.

---

## Roadmap

### Fase 1 · Diseño

- [ ] Definir métricas.
- [ ] Definir frecuencia de recolección.
- [ ] Definir esquema de datos.
- [ ] Definir identificadores de equipos.
- [ ] Diseñar arquitectura.

### Fase 2 · Agente

- [ ] Implementar agente.
- [ ] Recolección de métricas del sistema.
- [ ] Recolección de métricas de red.
- [ ] Configuración del agente.
- [ ] Ejecución automática.

### Fase 3 · Backend

- [ ] API de recepción.
- [ ] Validación de datos.
- [ ] Almacenamiento.
- [ ] Autenticación.
- [ ] Procesamiento de métricas.

### Fase 4 · Dashboard

- [ ] Estado general.
- [ ] Métricas en tiempo real.
- [ ] Histórico.
- [ ] Filtros por equipo.
- [ ] Gráficas de utilización.
- [ ] Alertas.

### Fase 5 · Operación

- [ ] Despliegue en infraestructura.
- [ ] Documentación.
- [ ] Monitoreo del sistema.
- [ ] Backups.
- [ ] Mantenimiento.

---

## Relación con SavIA-Lab

`savia-traffic` forma parte de la infraestructura organizacional de SavIA-Lab y puede integrarse con otros recursos del laboratorio.

Su información puede contribuir a:

- planificación de recursos computacionales;
- identificación de necesidades de infraestructura;
- análisis de utilización;
- mantenimiento preventivo;
- seguimiento de disponibilidad;
- optimización de recursos.

---

## Documentación

La documentación técnica se encuentra en:

```text
docs/
├── architecture.md
├── deployment.md
└── metrics.md
```

---

## Estado

**Estado:** En desarrollo  
**Tipo:** `savia-*`  
**Propósito:** Monitoreo y análisis de infraestructura
