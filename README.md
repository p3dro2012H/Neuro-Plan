# Sistema de Monitoramento de Estudos — Detecção de Fadiga

## Estrutura
```
projeto/
├── visao-computacional/   # Script Python (OpenCV + MediaPipe)
├── backend/               # API Node.js + TypeScript
└── database/              # Schema PostgreSQL
```

## 1. Banco de dados
```bash
createdb monitoramento_fadiga
psql -d monitoramento_fadiga -f database/schema.sql
```

## 2. Back-end (Node.js + TypeScript)
```bash
cd backend
npm install
cp .env.example .env    # ajuste usuário/senha do Postgres
npm run dev              # inicia em http://localhost:3000
```

## 3. Visão computacional (Python)
```bash
cd visao-computacional
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python fatigue_detector.py
```

## Ponto de atenção para a equipe
No schema, `alertas_fadiga.sessao_id` é `UUID` e referencia `sessoes_estudo(id)`.
No script Python de exemplo, o `sessionId` enviado é uma string fixa
(`"sessao-local-01"`) só para fins de teste local.

Antes da entrega final, criem um endpoint `POST /sessoes` que retorna um UUID
real ao iniciar o app, e façam o script Python consumir esse UUID em vez do
valor fixo — isso fecha o ciclo: login → início de sessão → captura de vídeo →
alertas → pausas. 
