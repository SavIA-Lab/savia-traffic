#!/usr/bin/env bash

export LC_NUMERIC=C

# =========================================================
# CONFIGURACIÓN GENERAL
# =========================================================

COLLECT_INTERVAL=60
PUSH_INTERVAL=600
RETRY_INTERVAL=60

AGENT_VERSION="0.2.0"

REPO="$HOME/savia-traffic"
DATA_DIR="$REPO/dashboard/data"
CSV_NAME="telemetry_WS1.csv"
CSV_FILE="$DATA_DIR/$CSV_NAME"

INTERFACE="eno1"
BRANCH="main"

mkdir -p "$DATA_DIR"

# Comprobar que el repositorio existe
if [ ! -d "$REPO/.git" ]; then
    echo "ERROR: No se encontró el repositorio Git en $REPO"
    exit 1
fi

cd "$REPO" || exit 1

# =========================================================
# INICIALIZACIÓN DEL CSV
# =========================================================

if [ ! -f "$CSV_FILE" ]; then

    echo "timestamp,station_user,hostname,cpu_usage_percent,ram_usage_percent,ram_used_gb,storage_usage_percent,gpu_usage_percent,gpu_memory_used_gb,bytes_received,bytes_sent,packets_received,packets_sent,errors_received,errors_sent,state,uptime_seconds,agent_version" > "$CSV_FILE"

    echo "CSV creado: $CSV_FILE"

fi

# =========================================================
# VARIABLES DE SINCRONIZACIÓN
# =========================================================

CURRENT_TIME=$(date +%s)

LAST_SYNC_SUCCESS=$CURRENT_TIME
LAST_SYNC_ATTEMPT=0

# =========================================================
# FUNCIONES AUXILIARES
# =========================================================

# ---------------------------------------------------------
# CPU
# Calcula el uso a partir de /proc/stat
# ---------------------------------------------------------

get_cpu_usage() {

    read -r _ USER NICE SYSTEM IDLE IOWAIT IRQ SOFTIRQ STEAL _ < /proc/stat

    TOTAL_1=$((USER + NICE + SYSTEM + IDLE + IOWAIT + IRQ + SOFTIRQ + STEAL))
    IDLE_1=$((IDLE + IOWAIT))

    sleep 1

    read -r _ USER NICE SYSTEM IDLE IOWAIT IRQ SOFTIRQ STEAL _ < /proc/stat

    TOTAL_2=$((USER + NICE + SYSTEM + IDLE + IOWAIT + IRQ + SOFTIRQ + STEAL))
    IDLE_2=$((IDLE + IOWAIT))

    TOTAL_DIFF=$((TOTAL_2 - TOTAL_1))
    IDLE_DIFF=$((IDLE_2 - IDLE_1))

    if [ "$TOTAL_DIFF" -gt 0 ]; then

        awk \
            -v total="$TOTAL_DIFF" \
            -v idle="$IDLE_DIFF" \
            'BEGIN {printf "%.1f", (1-idle/total)*100}'

    else

        echo ""

    fi
}

# ---------------------------------------------------------
# RED
# Obtiene una métrica de la interfaz de red
# ---------------------------------------------------------

get_network_stat() {

    local metric="$1"
    local file="/sys/class/net/$INTERFACE/statistics/$metric"

    if [ -f "$file" ]; then
        cat "$file"
    else
        echo ""
    fi
}

# ---------------------------------------------------------
# GPU
# Obtiene utilización y memoria de NVIDIA
# ---------------------------------------------------------

get_gpu_data() {

    if command -v nvidia-smi >/dev/null 2>&1; then

        nvidia-smi \
            --query-gpu=utilization.gpu,memory.used \
            --format=csv,noheader,nounits 2>/dev/null \
            | head -1

    else

        echo ""

    fi
}

# =========================================================
# FUNCIÓN DE SINCRONIZACIÓN CON GITHUB
# =========================================================

sync_to_github() {

    local SYNC_TIMESTAMP
    SYNC_TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    echo "[$SYNC_TIMESTAMP] Iniciando sincronización..."

    cd "$REPO" || return 1

    # -----------------------------------------------------
    # Agregar únicamente el CSV de esta estación
    # -----------------------------------------------------

    git add -- "dashboard/data/$CSV_NAME"

    # -----------------------------------------------------
    # Crear commit si existen cambios
    # -----------------------------------------------------

    if ! git diff --cached --quiet; then

        if ! git commit -m "data: workstation1 telemetry $SYNC_TIMESTAMP"; then

            echo "ERROR: No se pudo crear el commit."
            return 1

        fi

    else

        echo "No hay nuevos cambios para registrar."

    fi

    # -----------------------------------------------------
    # Actualizar la rama local
    # -----------------------------------------------------

    if ! git pull --rebase origin "$BRANCH"; then

        echo "ERROR: No se pudo actualizar la rama local."
        echo "Se conservarán los datos locales para el próximo intento."

        # Si existe un rebase incompleto, intentar abortarlo.
        git rebase --abort 2>/dev/null || true

        return 1

    fi

    # -----------------------------------------------------
    # Enviar cambios a GitHub
    # -----------------------------------------------------

    if git push origin "$BRANCH"; then

        echo "[$SYNC_TIMESTAMP] Sincronización completada correctamente."

        return 0

    else

        echo "ERROR: Falló el push."
        echo "Se volverá a intentar automáticamente."

        return 1

    fi
}

# =========================================================
# INICIO DEL AGENTE
# =========================================================

echo "================================================="
echo "SavIA-Traffic Collector"
echo "Versión: $AGENT_VERSION"
echo "Estación: $CSV_NAME"
echo "Recopilación: cada ${COLLECT_INTERVAL}s"
echo "Push: cada ${PUSH_INTERVAL}s"
echo "================================================="

# =========================================================
# BUCLE PRINCIPAL
# =========================================================

while true; do

    # -----------------------------------------------------
    # GENERAL
    # -----------------------------------------------------

    TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    HOSTNAME=$(hostname)

    DEVICE_ID=$(loginctl list-sessions --no-legend 2>/dev/null \
        | awk '$3 != "root" {print $3; exit}')

    if [ -z "$DEVICE_ID" ]; then
        DEVICE_ID="no_active_user"
    fi

    # -----------------------------------------------------
    # CPU
    # -----------------------------------------------------

    CPU_USAGE=$(get_cpu_usage)

    # -----------------------------------------------------
    # RAM
    # -----------------------------------------------------

    RAM_TOTAL_MB=$(free -m | awk '/Mem:/ {print $2}')
    RAM_USED_MB=$(free -m | awk '/Mem:/ {print $3}')

    RAM_USAGE=$(awk \
        -v used="$RAM_USED_MB" \
        -v total="$RAM_TOTAL_MB" \
        'BEGIN {
            if (total > 0)
                printf "%.1f", (used/total)*100
            else
                print ""
        }')

    RAM_USED_GB=$(awk \
        -v used="$RAM_USED_MB" \
        'BEGIN {printf "%.2f", used/1024}')

    # -----------------------------------------------------
    # STORAGE
    # -----------------------------------------------------

    STORAGE_USAGE=$(df / | awk 'NR==2 {
        gsub("%","",$5);
        print $5
    }')

    # -----------------------------------------------------
    # GPU
    # -----------------------------------------------------

    GPU_DATA=$(get_gpu_data)

    GPU_USAGE=""
    GPU_MEMORY_MB=""
    GPU_MEMORY_GB=""

    if [ -n "$GPU_DATA" ]; then

        IFS=',' read -r GPU_USAGE GPU_MEMORY_MB <<< "$GPU_DATA"

        GPU_USAGE=$(echo "$GPU_USAGE" | xargs)
        GPU_MEMORY_MB=$(echo "$GPU_MEMORY_MB" | xargs)

        GPU_MEMORY_GB=$(awk \
            -v mem="$GPU_MEMORY_MB" \
            'BEGIN {
                if (mem != "")
                    printf "%.2f", mem/1024
                else
                    print ""
            }')

    fi

    # -----------------------------------------------------
    # NETWORK
    # -----------------------------------------------------

    BYTES_RECEIVED=$(get_network_stat rx_bytes)
    BYTES_SENT=$(get_network_stat tx_bytes)

    PACKETS_RECEIVED=$(get_network_stat rx_packets)
    PACKETS_SENT=$(get_network_stat tx_packets)

    ERRORS_RECEIVED=$(get_network_stat rx_errors)
    ERRORS_SENT=$(get_network_stat tx_errors)

    # -----------------------------------------------------
    # STATUS
    # -----------------------------------------------------

    OPERSTATE="/sys/class/net/$INTERFACE/operstate"

    if [ -f "$OPERSTATE" ]; then

        if [ "$(cat "$OPERSTATE")" = "up" ]; then
            STATE="online"
        else
            STATE="offline"
        fi

    else

        STATE="unknown"

    fi

    # -----------------------------------------------------
    # UPTIME
    # -----------------------------------------------------

    UPTIME_SECONDS=$(awk '{printf "%.0f", $1}' /proc/uptime)

    # -----------------------------------------------------
    # CONSTRUIR FILA CSV
    # -----------------------------------------------------

    ROW="$TIMESTAMP,$DEVICE_ID,$HOSTNAME,$CPU_USAGE,$RAM_USAGE,$RAM_USED_GB,$STORAGE_USAGE,$GPU_USAGE,$GPU_MEMORY_GB,$BYTES_RECEIVED,$BYTES_SENT,$PACKETS_RECEIVED,$PACKETS_SENT,$ERRORS_RECEIVED,$ERRORS_SENT,$STATE,$UPTIME_SECONDS,$AGENT_VERSION"

    # -----------------------------------------------------
    # GUARDAR REGISTRO LOCALMENTE
    # -----------------------------------------------------

    echo "$ROW" >> "$CSV_FILE"

    echo "[$TIMESTAMP] Registro almacenado."
    echo "$ROW"

    # -----------------------------------------------------
    # CONTROL DEL INTERVALO DE SINCRONIZACIÓN
    # -----------------------------------------------------

    CURRENT_TIME=$(date +%s)

    TIME_SINCE_SYNC=$((CURRENT_TIME - LAST_SYNC_SUCCESS))
    TIME_SINCE_ATTEMPT=$((CURRENT_TIME - LAST_SYNC_ATTEMPT))

    SHOULD_SYNC=false

    # Sincronización normal cada 10 minutos
    if [ "$TIME_SINCE_SYNC" -ge "$PUSH_INTERVAL" ]; then

        # Evitar reintentos demasiado frecuentes
        if [ "$TIME_SINCE_ATTEMPT" -ge "$RETRY_INTERVAL" ]; then
            SHOULD_SYNC=true
        fi

    fi

    # -----------------------------------------------------
    # EJECUTAR SINCRONIZACIÓN
    # -----------------------------------------------------

    if [ "$SHOULD_SYNC" = true ]; then

        LAST_SYNC_ATTEMPT=$CURRENT_TIME

        if sync_to_github; then

            LAST_SYNC_SUCCESS=$(date +%s)

        else

            echo "La sincronización quedó pendiente."

        fi

    fi

    # -----------------------------------------------------
    # ESPERA HASTA LA SIGUIENTE RECOPILACIÓN
    # -----------------------------------------------------

    echo "Próxima recopilación en ${COLLECT_INTERVAL}s..."
    echo

    sleep "$COLLECT_INTERVAL"

done
