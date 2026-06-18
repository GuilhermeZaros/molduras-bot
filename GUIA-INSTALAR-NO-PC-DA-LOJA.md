# Guia: deixar a Bruna ligada no PC da loja

Objetivo: a Bruna (bot do WhatsApp) rodar **no PC da loja**, ligando sozinha quando o PC liga,
sem você precisar ficar com um terminal aberto.

> ⚠️ **Regra de ouro:** a Bruna só pode rodar em **UM PC por vez**. Quando ela estiver no PC da
> loja, **desligue a do seu PC** (feche a janela dela aí). O WhatsApp não deixa a mesma conta
> em duas máquinas ao mesmo tempo.

---

## Passo 1 — Levar a pasta pro PC da loja

Copie a pasta inteira **`molduras-bot`** do seu PC pro PC da loja (por pendrive ou Google Drive).

- **Tem que vir junto** (são importantes e fáceis de esquecer):
  - o arquivo **`.env`** (guarda as senhas/links — sem ele ela não funciona);
  - a pasta **`auth_info_baileys`** (a sessão do WhatsApp — com ela não precisa escanear QR).
- **Pode deixar de fora** (pra ir mais rápido, não são necessários): as pastas **`node_modules`**,
  **`catalogo`** e **`.git`**.
- No PC da loja, coloque em um lugar fácil, por exemplo: `C:\molduras-bot`.

## Passo 2 — Instalar o Node.js (o "motor")

1. No PC da loja, abra o site **nodejs.org**.
2. Baixe a versão **LTS** (o botão recomendado).
3. Instale clicando **Avançar / Avançar / Concluir** (deixe tudo no padrão).
4. Pra conferir: abra o **PowerShell** (menu Iniciar → digite "powershell") e digite:
   ```
   node -v
   ```
   Tem que aparecer algo como `v22.x.x`. Se apareceu, o motor está instalado. ✅

## Passo 3 — Instalar as peças da Bruna

1. Abra a pasta `molduras-bot` no PC da loja.
2. Clique na **barra de endereço** da pasta (onde aparece o caminho), apague, digite **`powershell`**
   e aperte Enter. Vai abrir um terminal **já dentro da pasta**.
3. Digite e aperte Enter:
   ```
   npm install
   ```
4. Espere terminar (uns minutos; baixa as peças que ela usa).

## Passo 4 — Ligar a Bruna a 1ª vez

1. Na pasta, dê **duplo-clique em `iniciar-bruna.bat`**.
2. O que pode acontecer:
   - **Conectou direto** (você copiou a `auth_info_baileys`): vai aparecer
     **`✅ Conectado ao WhatsApp! A Bruna está atendendo. 💬`**. Pronto!
   - **Pediu QR code:** no celular, vá em **WhatsApp → Configurações → Aparelhos conectados →
     Conectar um aparelho** e aponte a câmera pro QR que apareceu na janela.
3. Mande uma mensagem no WhatsApp pra testar — ela deve responder (e mandar foto se você pedir
   uma moldura).
4. **Agora desligue a Bruna do seu PC pessoal** (feche a janela dela lá), pra não rodar nos dois.

## Passo 5 — Fazer ela ligar sozinha quando o PC liga

1. Aperte **tecla Windows + R**, digite **`shell:startup`** e Enter. Vai abrir a pasta "Inicializar".
2. Volte na pasta `molduras-bot`, clique com o **botão direito** no `iniciar-bruna.bat` → **Copiar**.
3. Na pasta "Inicializar" que abriu, clique com o **botão direito** → **Colar atalho**
   (ou "Mostrar mais opções" → "Colar atalho").
4. Pronto: toda vez que o PC da loja ligar, a Bruna sobe sozinha. A janela aparece — pode
   **minimizar** (não feche).

---

## No dia a dia (o que você faz)

**Quase nada.** Só:
- Manter o **PC da loja ligado e com internet** no horário de atendimento.
- Deixar a **janela da Bruna minimizada** (nunca fechar).

Se ela cair, o `iniciar-bruna.bat` **reinicia sozinho** em 10 segundos. Se precisar, é só dar
duplo-clique nele de novo, ou reiniciar o PC.

## Como saber se está online

A janela da Bruna mostra **`✅ Conectado ao WhatsApp! A Bruna está atendendo. 💬`**.
Se mostrar QR code, é porque o WhatsApp pediu reconexão — escaneie como no Passo 4.

## Se der problema

- A janela fica **repetindo "Reiniciando..."** sem parar → copie a mensagem de erro que aparece e me mande.
- **Não responde** mas a janela diz "Conectado" → me avise.
- Esqueceu de copiar o `.env` → ela reclama ao iniciar; copie o `.env` do seu PC pra pasta dela.
