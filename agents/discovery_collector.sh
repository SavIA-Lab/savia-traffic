#!/usr/bin/env bash

export LC_NUMERIC=C

INTERVAL=180
AGENT_VERSION="0.1.1"

REPO="$HOME/savia-traffic"
DATA_DIR="$REPO/data/workstation2"
CSV_FILE="$DATA_DIR/telemetry.csv"

INTERFACE="eno1"

mkdir -p "$DATA_DIR"

# ---------------------------------------------------------
# CSV HEADER
# Solo se crea una vez
# ---------------------------------------------------------

if [ ! -f "$CSV_FILE" ]; then
    echo "timestamp,station_user,hostname,cpu_usage_percent,ram_usage_percent,ram_used_gb,storage_usage_percent,gpu_usage_percent,gpu_memory_used_gb,bytes_received,bytes_sent,packets_received,packets_sent,errors_received,errors_sent,state,uptime_seconds,agent_version" > "$CSV_FILE"
fi


while true; do

    # ---------------------------------------------------------
    # GENERAL
    # ---------------------------------------------------------

    TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    HOSTNAME=$(hostname)
    DEVICE_ID=$(loginctl list-sessions --no-legend | awk '$3 != "root" {print $3; exit}')
    if [ -z "$DEVICE_ID" ]; then
        DEVICE_ID="no_active_user"
    fi

    # ---------------------------------------------------------
    # CPU
    # ---------------------------------------------------------

    CPU_IDLE=$(top -bn1 | awk '/Cpu\(s\)/ {print $8}' | tr ',' '.')

    CPU_USAGE=$(awk \
        -v idle="$CPU_IDLE" \
        'BEGIN {printf "%.1f", 100-idle}')

    # ---------------------------------------------------------
    # RAM
    # ---------------------------------------------------------

    RAM_TOTAL_MB=$(free -m | awk '/Mem:/ {print $2}')
    RAM_USED_MB=$(free -m | awk '/Mem:/ {print $3}')

    RAM_USAGE=$(awk \
        -v used="$RAM_USED_MB" \
        -v total="$RAM_TOTAL_MB" \
        'BEGIN {printf "%.1f", (used/total)*100}')

    RAM_USED_GB=$(awk \
        -v used="$RAM_USED_MB" \
        'BEGIN {printf "%.2f", used/1024}')

    # ---------------------------------------------------------
    # STORAGE
    # ---------------------------------------------------------

    STORAGE_USAGE=$(df / | awk 'NR==2 {
        gsub("%","",$5);
        print $5
    }')

    # ---------------------------------------------------------
    # GPU
    # ---------------------------------------------------------

    GPU_DATA=$(nvidia-smi \
        --query-gpu=utilization.gpu,memory.used \
        --format=csv,noheader,nounits \
        | head -1)

    IFS=',' read -r GPU_USAGE GPU_MEMORY_MB <<< "$GPU_DATA"

    GPU_USAGE=$(echo "$GPU_USAGE" | xargs)
    GPU_MEMORY_MB=$(echo "$GPU_MEMORY_MB" | xargs)

    GPU_MEMORY_GB=$(awk \
        -v mem="$GPU_MEMORY_MB" \
        'BEGIN {printf "%.2f", mem/1024}')

    # ---------------------------------------------------------
    # NETWORK
    # ---------------------------------------------------------

    BYTES_RECEIVED=$(cat "/sys/class/net/$INTERFACE/statistics/rx_bytes")
    BYTES_SENT=$(cat "/sys/class/net/$INTERFACE/statistics/tx_bytes")

    PACKETS_RECEIVED=$(cat "/sys/class/net/$INTERFACE/statistics/rx_packets")
    PACKETS_SENT=$(cat "/sys/class/net/$INTERFACE/statistics/tx_packets")

    ERRORS_RECEIVED=$(cat "/sys/class/net/$INTERFACE/statistics/rx_errors")
    ERRORS_SENT=$(cat "/sys/class/net/$INTERFACE/statistics/tx_errors")

    # ---------------------------------------------------------
    # STATUS
    # ---------------------------------------------------------

    if [ "$(cat /sys/class/net/$INTERFACE/operstate)" = "up" ]; then
        STATE="online"
    else
        STATE="offline"
    fi

    UPTIME_SECONDS=$(awk '{printf "%.0f", $1}' /proc/uptime)

    # ---------------------------------------------------------
    # CONSTRUIR FILA CSV
    # ---------------------------------------------------------

    ROW="$TIMESTAMP,$DEVICE_ID,$HOSTNAME,$CPU_USAGE,$RAM_USAGE,$RAM_USED_GB,$STORAGE_USAGE,$GPU_USAGE,$GPU_MEMORY_GB,$BYTES_RECEIVED,$BYTES_SENT,$PACKETS_RECEIVED,$PACKETS_SENT,$ERRORS_RECEIVED,$ERRORS_SENT,$STATE,$UPTIME_SECONDS,$AGENT_VERSION"

    # Mostrar en consola
    echo "$ROW"

    # Guardar en CSV
    echo "$ROW" >> "$CSV_FILE"

    # ---------------------------------------------------------
    # GIT SYNC
    # ---------------------------------------------------------

    cd "$REPO" || exit 1

    git add "$CSV_FILE"

    if ! git diff --cached --quiet; then

        git commit -m "data: workstation2 telemetry $TIMESTAMP"

        git push origin main

        echo "[$TIMESTAMP] Telemetry pushed to GitHub."

    fi

    echo "Next collection in ${INTERVAL}s..."
    echo

    sleep "$INTERVAL"

done
