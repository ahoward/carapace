Here is a Product Requirements Document (PRD) for the **OpenClaw Desktop & Privacy Guard**.

# ---

**Product Requirements Document: OpenClaw Desktop**

**Version:** 1.0

**Status:** Draft

**Methodology:** Tauri Desktop \+ Bun/TypeScript Gatekeeper \+ SkyPilot

## **1\. Executive Summary**

The goal is to build a "zero-configuration" desktop application that allows non-DevOps users to deploy OpenClaw on a private cloud VPS. The application acts as a "Control Plane," managing the lifecycle of the remote infrastructure (via **SkyPilot**) and the secure networking (via **Tailscale**).

Crucially, it introduces a **"Data Gatekeeper"**, a middleware layer that strictly segregates data access based on the active AI model (Local vs. Cloud), ensuring that sensitive data never leaves the user's controlled environment when using third-party APIs like Anthropic.

## ---

**2\. User Flows & Core Features**

### **2.1 The "One-Click" Provisioning**

**User Story:** "As a user, I want to start OpenClaw without learning Terraform or SSH."

* **Mechanism:** User enters their Cloud Provider credentials (e.g., AWS/DigitalOcean API key) into the Electron settings.  
* **Action:** Clicking "Launch Server" triggers a background process that generates a sky launch config and spins up the VPS.  
* **Outcome:** A remote Docker container is running, connected to a private Tailscale mesh network, accessible via http://openclaw.internal.

### **2.2 The Privacy Toggle (Local vs. Cloud)**

**User Story:** "As a user, I want to seamlessly switch between the intelligence of Claude 3.5 (Cloud) and the privacy of Llama 3 (Local)."

* **Mechanism:** A toggle switch in the UI: **\[ 🔒 Local Mode \]** vs **\[ ☁️ Cloud Mode \]**.  
* **Action:**  
  * **Local Mode:** Routes inference to ollama on the VPS. The Gatekeeper allows access to /data/private.  
  * **Cloud Mode:** Routes inference to Anthropic API. The Gatekeeper **blocks** access to /data/private and only serves /data/public.

### **2.3 Data Sovereignty (The "Resident" Vault)**

**User Story:** "My data must live on my laptop, even if the server is destroyed."

* **Mechanism:** The application manages two local folders: \~/OpenClaw/Private and \~/OpenClaw/Public.  
* **Action:** These folders are continuously synced (via SkyPilot file\_mounts or rsync daemon) to the VPS.  
* **Outcome:** The "Source of Truth" is the local machine. The VPS is treated as ephemeral compute.

## ---

**3\. Technical Architecture**

### **3.1 Stack Overview**

* **Frontend (Host):** Electron (React/TypeScript) \- The UI and Orchestrator.  
* **Infrastructure (Host):** SkyPilot (CLI) \- Manages the cloud VPS.
* **Networking:** Tailscale \- Creates a secure, encrypted mesh between Host and VPS.  
* **Backend (VPS):** Docker \- Runs OpenClaw, Ollama, and the **Gatekeeper Middleware**.

### **3.2 The Gatekeeper Logic**

The OpenClaw Agent is **not** given direct filesystem access. Instead, it is configured to use a "File Retrieval Tool" that hits a local API. This API acts as the firewall for data.

## ---

**4\. Implementation Details & Code Samples**

### **4.1 Electron Main Process (Provisioning Orchestrator)**

This NodeJS code lives in the Electron "Main" process. It wraps the SkyPilot CLI to launch the cluster.

JavaScript

// src/main/provisioner.js  
const { exec } \= require('child\_process');  
const fs \= require('fs');  
const path \= require('path');

// Generate the SkyPilot YAML dynamically based on user config  
function generateSkyConfig(apiKey, instanceType) {  
  const config \= \`  
name: openclaw-cluster

resources:  
  cloud: digitalocean  
  instance\_type: ${instanceType || 's-4vcpu-8gb'}

\# MAP LOCAL DATA TO REMOTE VPS  
file\_mounts:  
  /app/data/public: \~/.openclaw/public  
  /app/data/private: \~/.openclaw/private

setup: |  
  \# Install Docker & Tailscale  
  curl \-fsSL https://get.docker.com | sh  
  curl \-fsSL https://tailscale.com/install.sh | sh  
  sudo tailscale up \--authkey=${process.env.TAILSCALE\_AUTH\_KEY}  
    
  \# Pull the Stack  
  docker pull openclaw/core:latest  
  docker pull ollama/ollama:latest

run: |  
  \# Run the Gatekeeper & OpenClaw  
  docker-compose up \-d  
\`;

  fs.writeFileSync(path.join(\_\_dirname, 'openclaw.yaml'), config);  
}

// The "One Click" Handler  
ipcMain.handle('launch-vps', async (event, userConfig) \=\> {  
  generateSkyConfig(userConfig.apiKey, userConfig.instanceType);  
    
  return new Promise((resolve, reject) \=\> {  
    // Execute SkyPilot launch  
    exec('sky launch \-y \-c openclaw-cluster openclaw.yaml', (error, stdout, stderr) \=\> {  
      if (error) {  
        console.error(\`Exec error: ${error}\`);  
        reject(stderr);  
      }  
      resolve(stdout); // Returns IP or success message  
    });  
  });  
});

### **4.2 The Gatekeeper Middleware (Bun/TypeScript)**

This runs **inside** the VPS Docker container. It is the only way the OpenClaw agent can read files.

Python

\# gatekeeper/main.py  
from fastapi import FastAPI, HTTPException, Header  
import os

app \= FastAPI()

\# Defined Volumes in Docker  
PUBLIC\_VAULT \= "/app/data/public"  
PRIVATE\_VAULT \= "/app/data/private"

\# The "State" is managed by the Electron App via a control endpoint  
CURRENT\_MODE \= "LOCAL" \# Options: LOCAL, CLOUD

@app.post("/control/set-mode")  
def set\_mode(mode: str):  
    global CURRENT\_MODE  
    if mode not in \["LOCAL", "CLOUD"\]:  
        raise HTTPException(status\_code=400, detail="Invalid Mode")  
    CURRENT\_MODE \= mode  
    return {"status": "updated", "mode": CURRENT\_MODE}

@app.get("/tools/fs/read")  
def read\_file(file\_path: str):  
    """  
    The Tool used by OpenClaw to read data.  
    """  
    \# 1\. Sanitize Path (Prevent traversal attacks)  
    safe\_path \= os.path.normpath(file\_path)  
      
    \# 2\. Check Permissions based on Mode  
    if safe\_path.startswith(PRIVATE\_VAULT):  
        if CURRENT\_MODE \== "CLOUD":  
            \# REJECT: Cloud models cannot see private data  
            print(f"\[SECURITY ALERT\] Cloud Model attempted to access {safe\_path}")  
            raise HTTPException(  
                status\_code=403,   
                detail="ACCESS\_DENIED: Sensitive data is locked in Cloud Mode."  
            )  
      
    \# 3\. If Safe, Read  
    if os.path.exists(safe\_path):  
        with open(safe\_path, 'r') as f:  
            return {"content": f.read()}  
      
    raise HTTPException(status\_code=404, detail="File not found")

@app.get("/tools/fs/list")  
def list\_files():  
    """  
    Lists available files. Hides private files if in Cloud Mode.  
    """  
    files \= \[\]  
      
    \# Always show Public  
    for root, dirs, filenames in os.walk(PUBLIC\_VAULT):  
        for f in filenames:  
            files.append(os.path.join(root, f))  
              
    \# Only show Private if Local  
    if CURRENT\_MODE \== "LOCAL":  
        for root, dirs, filenames in os.walk(PRIVATE\_VAULT):  
            for f in filenames:  
                files.append(os.path.join(root, f))  
                  
    return {"files": files}

### **4.3 The Docker Compose Configuration**

This ties the services together on the VPS, ensuring the networking is internal and secure.

YAML

\# docker-compose.yaml (On VPS)  
version: '3.8'

services:  
  \# 1\. The Intelligence (Local)  
  ollama:  
    image: ollama/ollama:latest  
    ports:  
      \- "11434:11434"  
    volumes:  
      \- ollama\_storage:/root/.ollama

  \# 2\. The Security Layer  
  gatekeeper:  
    build: ./gatekeeper  
    environment:  
      \- MODE=LOCAL \# Defaults to safe mode  
    volumes:  
      \- /app/data/public:/app/data/public \# Mounted from Host via SkyPilot  
      \- /app/data/private:/app/data/private \# Mounted from Host via SkyPilot  
    ports:  
      \- "8000:8000" \# Internal API for OpenClaw

  \# 3\. The Agent Framework  
  openclaw:  
    image: openclaw/core:latest  
    environment:  
      \- GATEKEEPER\_URL=http://gatekeeper:8000  
      \- OLLAMA\_HOST=http://ollama:11434  
    depends\_on:  
      \- gatekeeper  
      \- ollama

## ---

**5\. Security & Risk Analysis**

| Risk | Mitigation Strategy |
| :---- | :---- |
| **Agent Jailbreak** | The OpenClaw agent container has **no volumes mounted**. It cannot read the disk directly. It *must* go through the Gatekeeper API to read files. |
| **Cloud Leakage** | The Gatekeeper state (CURRENT\_MODE) defaults to LOCAL on boot. If the Electron app disconnects or crashes, the system fails secure (Private data is locked). |
| **VPS Compromise** | Tailscale ensures the VPS has no open ports to the public internet (except SSH for SkyPilot). All traffic is tunneled. |

## **6\. Next Steps**

1. **Prototype:** Build the Bun/TypeScript Gatekeeper and test "Cloud Mode" rejection logic.
2. **UI Mockup:** Design the "Privacy Toggle" interaction in Figma.  
3. **SkyPilot Test:** Verify file\_mounts latency for larger datasets (e.g., 500MB+ repos).
