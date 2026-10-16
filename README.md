# Campus Equipment Lending

A small Web3 app for sharing campus equipment. The Solidity contract records equipment, borrowers, and return requests; the browser frontend connects to it with MetaMask on the Sepolia test network.

## Features

- Register equipment (contract administrator only)
- Borrow available equipment
- Request a return as the current borrower
- Confirm a return (contract administrator only)
- View the equipment list and each item's status

## Requirements

- A Web3 browser wallet such as MetaMask
- A browser with access to the Sepolia network
- Sepolia test ETH to deploy the contract and submit transactions
- Python 3 (or another local static HTTP server) to serve the frontend

The frontend loads ethers.js 6.7.0 from cdnjs, so an internet connection is needed when the page loads.

## Deploy the contract

1. Open [`contracts/EquipmentLending.sol`](contracts/EquipmentLending.sol) in [Remix](https://remix.ethereum.org/).
2. Compile it with a Solidity 0.8.24-compatible compiler.
3. In MetaMask, select **Sepolia** and connect Remix using **Injected Provider**.
4. Deploy `EquipmentLending`. The deploying wallet becomes the contract administrator.
5. Copy the deployed contract address.
6. In Remix's compilation details, copy the contract ABI and save it as `frontend/abi.json`, replacing the existing file.
7. Open `frontend/app.js` and replace the `ADDRESS` value with the deployed address.

The frontend is configured for Sepolia (chain ID `11155111`) and checks that code exists at the configured address before connecting. The ABI and address must refer to the same deployed contract.

## Run the frontend locally

Serve the `frontend` directory over HTTP; opening `index.html` directly as a `file://` URL will prevent the browser from loading the ABI reliably.

From the repository root, run:

```powershell
cd frontend
py -m http.server 8000
```

If `py` is unavailable but Python is installed, use:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000> in your browser, connect MetaMask, and approve the connection on Sepolia. Keep the server running while using the app.

## Use the app

- The wallet that deployed the contract can register equipment and confirm return requests.
- Any connected wallet can borrow an available item.
- Only the wallet currently borrowing an item can request its return.
- The administrator confirms the return, which makes the item available again.
- Use **Refresh list** to reload equipment from the contract.

Each write action prompts MetaMask for approval and requires Sepolia test ETH for gas. Contract rules are enforced on-chain, so the administrator-only controls are not an access-control boundary by themselves.

## Project layout

```text
contracts/
  EquipmentLending.sol   Solidity lending contract
frontend/
  app.js                 Wallet and contract interactions
  abi.json               ABI loaded by the browser
  index.html             App structure
  style.css              Dark responsive UI
```
