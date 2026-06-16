# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aestheva is an aesthetic clinic management system with two components currently in development:

1. **`aestheva-calculadora.html`** — A standalone single-file financial calculator (HTML/CSS/JS). No build step; open directly in a browser.
2. **`aestheva_os/DataClientes/`** — A Java 25 NetBeans (Apache Ant) project for patient data management.

## Running & Building

### Financial Calculator
Open `aestheva-calculadora.html` directly in any browser. No server or build process required. Chart.js is loaded from CDN (`cdnjs.cloudflare.com`), so an internet connection is needed on first load.

### Java DataClientes (NetBeans / Ant)
```bash
# Compile
cd aestheva_os/DataClientes
ant compile

# Run
ant run

# Build JAR
ant jar

# Clean
ant clean
```

The main class is `dataclientes.DataClientes`. Java 25 source/target is required.

## Architecture

### aestheva-calculadora.html

All HTML, CSS, and JavaScript live in one file. The UI is tab-based with 11 panels:

| Panel ID | Tab Label |
|---|---|
| `dashboard` | Resumen General |
| `servicio` | Costo por Servicio |
| `inventario` | Inventario de Productos |
| `recetas` | Recetas por Servicio |
| `descuento` | Simulador de Descuentos |
| `equilibrio` | Punto de Equilibrio |
| `capacidad` | Capacidad Instalada |
| `depreciacion` | Depreciación de Equipos |
| `ventas` | Ventas del Mes |
| `gastos` | Gastos del Mes |
| `anual` | Análisis Anual |

`showPanel(id, el)` handles tab switching. State lives in in-memory JS variables (no persistence between page reloads). Charts use Chart.js 4.4.1.

**Design tokens** are defined as CSS variables in `:root` (`--cream`, `--gold`, `--rose`, `--deep`, etc.) and should be used for all new UI elements to stay consistent with the luxury aesthetic.

### aestheva_os/DataClientes (Java)

- `Paciente.java` — Plain data class: `id`, `nombre`, `telefono`, `peso`, `estatura`, `numeroVisitas`, `ArrayList<String> tratamientos`.
- `DataClientes.java` — Entry point; currently demonstrates creating and printing a list of `Paciente` objects.

The `test/` directory exists but has no tests yet.
