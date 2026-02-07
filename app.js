const MARKET_ADDRESS = "0x04537E2627793136074ed1467Ba868180B42e8c8";
const TOKEN_ADDRESS  = "0x37a97eBA23a932E2190ecd8e0dDA0fb66A0118CB";

const MARKET_ABI = [
  "function createEvent(string title, uint256 deadline, uint8 optionsCount) external returns (uint256)",
  "function bet(uint256 eventId, uint8 option) external payable",
  "function finalize(uint256 eventId, uint8 winningOption) external",
  "function claim(uint256 eventId) external",
  "function eventsData(uint256) view returns (string title, uint256 deadline, address creator, bool finalized, uint8 optionsCount, uint8 winningOption, uint256 totalPool)",
  "function nextEventId() view returns (uint256)"
];

const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const SEPOLIA_CHAIN_ID = "0xaa36a7";

let provider, signer, account;
let market, token;

const $ = (id) => document.getElementById(id);

function log(msg) {
  $("log").textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + $("log").textContent;
}

function setStatus(msg) {
  $("status").textContent = msg;
}

async function connect() {
  if (!window.ethereum) {
    alert("MetaMask not found.");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  account = await signer.getAddress();

  $("addr").textContent = account;

  $("status").textContent = "MetaMask Connected";

  await ensureNetwork();
  await initContracts();
  await refreshBalances();

  log("Connected to MetaMask");
}

async function ensureNetwork() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  const isSepolia = chainId.toLowerCase() === SEPOLIA_CHAIN_ID;

  $("netBadge").classList.remove("ok","bad");
  $("netBadge").classList.add(isSepolia ? "ok" : "bad");

  if (!isSepolia) {
    setStatus("Please switch MetaMask network to Sepolia");
    log("Wrong network — switch to Sepolia");
  }
}

async function initContracts() {
  $("marketAddr").textContent = MARKET_ADDRESS;
  $("tokenAddr").textContent = TOKEN_ADDRESS;

  if (!MARKET_ADDRESS.startsWith("0x") || !TOKEN_ADDRESS.startsWith("0x")) {
    log("Paste contract addresses into app.js (MARKET_ADDRESS, TOKEN_ADDRESS)");
    return;
  }

  market = new ethers.Contract(MARKET_ADDRESS, MARKET_ABI, signer);
  token  = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, provider); 

  log("Contracts initialized");
}

async function refreshBalances() {
  if (!provider || !account) return;

  const eth = await provider.getBalance(account);
  $("ethBal").textContent = `${ethers.utils.formatEther(eth)} ETH`;

  if (token) {
    try {
      const [bal, dec] = await Promise.all([token.balanceOf(account), token.decimals()]);
      $("predBal").textContent = `${ethers.utils.formatUnits(bal, dec)} PRED`;
    } catch (e) {
      $("predBal").textContent = "—";
      log("Token balance: paste correct ERC-20 ABI/address later");
    }
  } else {
    $("predBal").textContent = "—";
  }
}

async function createEvent() {
  if (!market) return alert("Paste MARKET_ADDRESS + ABI in app.js first.");
  await ensureNetwork();

  const title = $("evTitle").value.trim();
  const deadline = Number($("evDeadline").value);
  const options = Number($("evOptions").value);

  if (!title) return alert("Title required");
  if (!deadline || deadline < Math.floor(Date.now() / 1000)) return alert("Deadline must be a future unix timestamp");
  if (!options || options < 2 || options > 5) return alert("Options count must be 2..5");

  try {
    setStatus("Creating event…");
    const tx = await market.createEvent(title, deadline, options);
    log(`createEvent tx: ${tx.hash}`);
    await tx.wait();
    setStatus("Event created");
    log("Event created successfully");
    await loadEvents();
  } catch (e) {
    setStatus("Create failed");
    log(`Create error: ${e.message || e}`);
  }
}

async function placeBet() {
  if (!market) return alert("Paste MARKET_ADDRESS + ABI in app.js first.");
  await ensureNetwork();

  const eventId = Number($("betEventId").value);
  const option = Number($("betOption").value);
  const amount = $("betAmount").value;

  if (Number.isNaN(eventId)) return alert("Event ID invalid");
  if (Number.isNaN(option)) return alert("Option invalid");
  if (!amount || Number(amount) <= 0) return alert("ETH amount invalid");

  try {
    setStatus("Placing bet…");
    const tx = await market.bet(eventId, option, { value: ethers.utils.parseEther(amount) });
    log(`bet tx: ${tx.hash}`);
    await tx.wait();
    setStatus("Bet placed");
    log("Bet placed successfully");
    await refreshBalances();
    await loadEvents();
  } catch (e) {
    setStatus("Bet failed");
    log(`Bet error: ${e.message || e}`);
  }
}

async function finalizeEvent() {
  if (!market) return alert("Paste MARKET_ADDRESS + ABI in app.js first.");
  await ensureNetwork();

  const eventId = Number($("finEventId").value);
  const winning = Number($("finOption").value);

  if (Number.isNaN(eventId) || Number.isNaN(winning)) return alert("Invalid inputs");

  try {
    setStatus("Finalizing…");
    const tx = await market.finalize(eventId, winning);
    log(`finalize tx: ${tx.hash}`);
    await tx.wait();
    setStatus("Finalized");
    log("Event finalized successfully");
    await loadEvents();
  } catch (e) {
    setStatus("Finalize failed");
    log(`Finalize error: ${e.message || e}`);
  }
}

async function loadEvents() {
  if (!market) return;

  try {
    const n = await market.nextEventId();
    const total = Number(n.toString());
    const start = Math.max(0, total - 10);

    const rows = [];
    for (let id = start; id < total; id++) {
      const e = await market.eventsData(id);

      const title = e.title;
      const deadline = Number(e.deadline.toString());
      const finalized = e.finalized;
      const totalPoolWei = e.totalPool;

      rows.push({
        id,
        title,
        deadline,
        status: finalized ? "finalized" : "active",
        poolEth: ethers.utils.formatEther(totalPoolWei)
      });
    }

    renderEvents(rows);
    log("Events loaded");
  } catch (e) {
    log("Events list not available yet — implement eventsData(id) + nextEventId() in your contract or change ABI.");
  }
}

function renderEvents(rows) {
  const body = $("eventsBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No events</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${r.id}</td>
      <td>${escapeHtml(r.title)}</td>
      <td class="mono">${r.deadline}</td>
      <td>${r.status}</td>
      <td class="mono">${r.poolEth}</td>
    </tr>
  `).join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function claim() {
  const eventId = Number(document.getElementById("finEventId").value);
  const tx = await market.claim(eventId);
  log(`claim tx: ${tx.hash}`);
  await tx.wait();
  log("Claim done");
  await refreshBalances();

  try {
  const tx = await market.claim(eventId);
  log("claim tx: " + tx.hash);
  await tx.wait();
  log("Claim done ✅");
} catch (e) {
  log("Claim failed: " + (e?.data?.message || e?.message));
  alert(e?.data?.message || e?.message);
}

}
document.getElementById("btnClaim").addEventListener("click", claim);


$("btnConnect").addEventListener("click", connect);
$("btnRefresh").addEventListener("click", async () => { await ensureNetwork(); await refreshBalances(); });
$("btnCreate").addEventListener("click", createEvent);
$("btnBet").addEventListener("click", placeBet);
$("btnFinalize").addEventListener("click", finalizeEvent);
$("btnLoad").addEventListener("click", loadEvents);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}
