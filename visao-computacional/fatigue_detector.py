"""
fatigue_detector.py
--------------------
Monitor de fadiga em tempo real via webcam usando o MediaPipe Face Landmarker
(Tasks API — a API antiga "mp.solutions" foi removida pelo Google nas versões
recentes do pacote, então usamos a substituta oficial).

Métricas utilizadas:
  - EAR (Eye Aspect Ratio): detecta olhos fechados / piscadas longas.
  - MAR (Mouth Aspect Ratio): detecta bocejos.

Quando o estado de fadiga é sustentado por N segundos consecutivos,
o script dispara um POST para a API do back-end (Node.js/Express).

Autor: Equipe do projeto - Monitoramento de Estudos
"""

import os
import time
import urllib.request
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np
import requests
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# URL oficial do Google para o modelo de landmarks faciais (baixado uma única vez)
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")

# =========================================================================
# 1. CONFIGURAÇÃO GERAL
# =========================================================================

# Endpoint da API back-end que receberá os alertas de fadiga
API_URL = "http://localhost:3000/alertas"

# --- Limiares de detecção (ajustar depois de testes empíricos) ---
EAR_THRESHOLD = 0.21          # abaixo disso, consideramos "olho fechado"
EAR_CONSEC_SECONDS = 2.5      # olhos fechados por esse tempo -> sinal de fadiga

MAR_THRESHOLD = 0.60          # acima disso, consideramos "boca aberta" (bocejo)
MAR_CONSEC_SECONDS = 1.2      # boca aberta por esse tempo -> bocejo confirmado

ALERT_COOLDOWN_SECONDS = 30   # tempo mínimo entre dois alertas enviados à API

# --- Índices dos landmarks do MediaPipe Face Mesh (468 pontos) ---
# Olho esquerdo (na imagem, ponto de vista da câmera)
LEFT_EYE = [33, 160, 158, 133, 153, 144]
# Olho direito
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
# Boca: cantos (78, 308), lábio superior/inferior (13, 14)
MOUTH = {"left": 78, "right": 308, "top": 13, "bottom": 14}


@dataclass
class FatigueState:
    """Guarda os contadores de tempo entre um frame e outro."""
    eyes_closed_since: float | None = None
    mouth_open_since: float | None = None
    last_alert_sent: float = 0.0


# =========================================================================
# 2. FUNÇÕES DE CÁLCULO DAS MÉTRICAS
# =========================================================================

def _euclidean(p1, p2) -> float:
    return float(np.linalg.norm(np.array(p1) - np.array(p2)))


def calculate_ear(landmarks, eye_indices, frame_w, frame_h) -> float:
    """
    Calcula o Eye Aspect Ratio (EAR) de um olho.
    EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    """
    coords = [
        (landmarks[i].x * frame_w, landmarks[i].y * frame_h) for i in eye_indices
    ]
    p1, p2, p3, p4, p5, p6 = coords

    vertical_1 = _euclidean(p2, p6)
    vertical_2 = _euclidean(p3, p5)
    horizontal = _euclidean(p1, p4)

    if horizontal == 0:
        return 0.0
    return (vertical_1 + vertical_2) / (2.0 * horizontal)


def calculate_mar(landmarks, mouth_indices, frame_w, frame_h) -> float:
    """
    Calcula o Mouth Aspect Ratio (MAR).
    MAR = distância vertical (lábios) / distância horizontal (cantos da boca)
    """
    top = landmarks[mouth_indices["top"]]
    bottom = landmarks[mouth_indices["bottom"]]
    left = landmarks[mouth_indices["left"]]
    right = landmarks[mouth_indices["right"]]

    top_pt = (top.x * frame_w, top.y * frame_h)
    bottom_pt = (bottom.x * frame_w, bottom.y * frame_h)
    left_pt = (left.x * frame_w, left.y * frame_h)
    right_pt = (right.x * frame_w, right.y * frame_h)

    vertical = _euclidean(top_pt, bottom_pt)
    horizontal = _euclidean(left_pt, right_pt)

    if horizontal == 0:
        return 0.0
    return vertical / horizontal


# =========================================================================
# 3. COMUNICAÇÃO COM O BACK-END (Python -> Node.js)
# =========================================================================

def send_fatigue_alert(alert_type: str, metric_value: float, session_id: str = "8b34821f-2109-406a-aab1-2192bb535653") -> None:
    """
    Envia um POST para a API Node.js informando que a fadiga foi confirmada.
    Falhas de rede não devem travar o loop principal de captura de vídeo,
    por isso o erro é apenas logado no console.
    """
    payload = {
        "sessionId": session_id,
        "tipo": alert_type,          # "OLHOS_FECHADOS" ou "BOCEJO"
        "valorMetrica": round(metric_value, 3),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    try:
        response = requests.post(API_URL, json=payload, timeout=3)
        response.raise_for_status()
        print(f"[ALERTA ENVIADO] {alert_type} -> status {response.status_code}")
    except requests.exceptions.RequestException as exc:
        print(f"[ERRO] Falha ao enviar alerta para a API: {exc}")


# =========================================================================
# 4. LOOP PRINCIPAL DE CAPTURA E PROCESSAMENTO
# =========================================================================

def _garantir_modelo_baixado() -> None:
    """Baixa o arquivo de modelo do Face Landmarker na primeira execução, se necessário."""
    if os.path.exists(MODEL_PATH):
        return
    print("Baixando o modelo do Face Landmarker (só acontece na 1ª execução)...")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Modelo baixado com sucesso.")
    except Exception as exc:
        raise RuntimeError(
            "Não foi possível baixar o modelo automaticamente. Baixe manualmente em:\n"
            f"{MODEL_URL}\n"
            f"e salve o arquivo como: {MODEL_PATH}"
        ) from exc


def main() -> None:
    _garantir_modelo_baixado()

    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = vision.FaceLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    face_landmarker = vision.FaceLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Não foi possível acessar a webcam.")

    state = FatigueState()

    print("Monitor de fadiga iniciado. Pressione 'q' para sair.")

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            continue

        frame = cv2.flip(frame, 1)
        h, w = frame.shape[:2]
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        timestamp_ms = int(time.time() * 1000)
        results = face_landmarker.detect_for_video(mp_image, timestamp_ms)

        now = time.time()

        if results.face_landmarks:
            landmarks = results.face_landmarks[0]

            # --- EAR (média dos dois olhos) ---
            left_ear = calculate_ear(landmarks, LEFT_EYE, w, h)
            right_ear = calculate_ear(landmarks, RIGHT_EYE, w, h)
            avg_ear = (left_ear + right_ear) / 2.0

            # --- MAR ---
            mar = calculate_mar(landmarks, MOUTH, w, h)

            # --- Lógica de olhos fechados sustentados ---
            if avg_ear < EAR_THRESHOLD:
                if state.eyes_closed_since is None:
                    state.eyes_closed_since = now
                elapsed = now - state.eyes_closed_since
                if (
                    elapsed >= EAR_CONSEC_SECONDS
                    and (now - state.last_alert_sent) >= ALERT_COOLDOWN_SECONDS
                ):
                    send_fatigue_alert("OLHOS_FECHADOS", avg_ear)
                    state.last_alert_sent = now
            else:
                state.eyes_closed_since = None

            # --- Lógica de bocejo sustentado ---
            if mar > MAR_THRESHOLD:
                if state.mouth_open_since is None:
                    state.mouth_open_since = now
                elapsed = now - state.mouth_open_since
                if (
                    elapsed >= MAR_CONSEC_SECONDS
                    and (now - state.last_alert_sent) >= ALERT_COOLDOWN_SECONDS
                ):
                    send_fatigue_alert("BOCEJO", mar)
                    state.last_alert_sent = now
            else:
                state.mouth_open_since = None

            # --- Overlay de depuração na tela ---
            cv2.putText(frame, f"EAR: {avg_ear:.2f}", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(frame, f"MAR: {mar:.2f}", (20, 75),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        cv2.imshow("Monitor de Fadiga - Pressione 'q' para sair", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    face_landmarker.close()


if __name__ == "__main__":
    main()
