import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDerRNJAbwBr8G7sjp7guj3HmKBBh0S6UE",
    authDomain: "gesyweb-2d8f6.firebaseapp.com",
    projectId: "gesyweb-2d8f6",
    storageBucket: "gesyweb-2d8f6.firebasestorage.app",
    messagingSenderId: "813863962923",
    appId: "1:813863962923:web:b43d2dc67ff6acdd86dd6e",
    measurementId: "G-YWF06XCFZL"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => console.log('SW error:', err));
    });
}

// Colecciones
const colObras = collection(db, "proyectos");
const colClientes = collection(db, "clientes");
const colIncidencias = collection(db, "incidencias");
const colOperarios = collection(db, "operarios");
const colHerramientas = collection(db, "herramientas");
const colVehiculos = collection(db, "vehiculos"); 
const colFichajes = collection(db, "fichajes");
const docConfigEmpresa = doc(db, "configuracion", "empresa");

// Cachés
let cacheFichajes = [], cacheVehiculos = [], cacheObras = [], cacheClientes = [];
let cacheIncidencias = [], cacheOperarios = [], cacheHerramientas = [];
let datosEmpresaActual = { nombre: "Gesyweb Reformas", cif: "", telefono: "", email: "", direccion: "", logo: "", claveAdmin: "admin1234" };
let usuarioActivo = JSON.parse(localStorage.getItem("gesyweb_usuario_activo") || "null");

// ========================================================
// 1. AUTENTICACIÓN Y ROLES (RBAC)
// ========================================================
window.conmutarTabLogin = (tab) => {
    const btnGer = document.getElementById("tab-login-gerencia");
    const btnOpe = document.getElementById("tab-login-operario");
    const fGer = document.getElementById("form-login-gerencia");
    const fOpe = document.getElementById("form-login-operario");
    document.getElementById("login-error-msg")?.classList.add("hidden");

    if (tab === "GERENCIA") {
        btnGer.className = "py-2.5 rounded-lg bg-slate-900 text-white shadow-sm transition";
        btnOpe.className = "py-2.5 rounded-lg text-slate-600 hover:text-slate-900 transition";
        fGer.classList.remove("hidden");
        fOpe.classList.add("hidden");
    } else {
        btnOpe.className = "py-2.5 rounded-lg bg-slate-900 text-white shadow-sm transition";
        btnGer.className = "py-2.5 rounded-lg text-slate-600 hover:text-slate-900 transition";
        fOpe.classList.remove("hidden");
        fGer.classList.add("hidden");
    }
};

window.procesarLogin = (rolSolicitado) => {
    const err = document.getElementById("login-error-msg");
    if (err) err.classList.add("hidden");

    if (rolSolicitado === "GERENCIA") {
        const u = document.getElementById("login-admin-user").value.trim().toLowerCase();
        const p = document.getElementById("login-admin-pass").value.trim();
        const claveValida = datosEmpresaActual.claveAdmin || "admin1234";

        if ((u === "admin" || (datosEmpresaActual.email && u === datosEmpresaActual.email.toLowerCase())) && p === claveValida) {
            usuarioActivo = { rol: "GERENCIA", nombre: "Oficina / Gerencia" };
            localStorage.setItem("gesyweb_usuario_activo", JSON.stringify(usuarioActivo));
            aplicarSesionUsuario();
        } else {
            err.textContent = "Credenciales incorrectas.";
            err.classList.remove("hidden");
        }
    } else {
        const nom = document.getElementById("login-operario-nombre").value.trim().toLowerCase();
        const dni = document.getElementById("login-operario-dni").value.trim().toUpperCase().replace(/[\s-]/g, "");

        const encontrado = cacheOperarios.find(o => {
            const dniLimpio = (o.dni || "").toUpperCase().replace(/[\s-]/g, "");
            return o.nombre && o.nombre.trim().toLowerCase() === nom && dniLimpio === dni;
        });

        if (encontrado) {
            usuarioActivo = { rol: "OPERARIO", nombre: encontrado.nombre, idOperario: encontrado.id };
            localStorage.setItem("gesyweb_usuario_activo", JSON.stringify(usuarioActivo));
            aplicarSesionUsuario();
        } else {
            err.textContent = "Operario no encontrado o DNI incorrecto.";
            err.classList.remove("hidden");
        }
    }
};

window.cerrarSesion = () => {
    localStorage.removeItem("gesyweb_usuario_activo");
    usuarioActivo = null;
    document.getElementById("modal-login").classList.remove("hidden");
};

function aplicarSesionUsuario() {
    const modal = document.getElementById("modal-login");
    if (!usuarioActivo) { modal.classList.remove("hidden"); return; }
    modal.classList.add("hidden");

    const badge = document.getElementById("badge-rol-usuario");
    if (badge) {
        badge.textContent = usuarioActivo.rol;
        badge.className = usuarioActivo.rol === "GERENCIA" 
            ? "px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300" 
            : "px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/20 text-sky-300";
    }
    document.getElementById("nombre-usuario-sesion").textContent = usuarioActivo.nombre;

    const esOperario = usuarioActivo.rol === "OPERARIO";
    ["nav-dashboard", "nav-clientes", "nav-operarios", "nav-ajustes", "btn-abrir-modal-obra"].forEach(id => {
        const el = document.getElementById(id);
        if (el) esOperario ? el.classList.add("hidden") : el.classList.remove("hidden");
    });

    window.cambiarVista(esOperario ? 'fichajes' : 'dashboard');
    renderizarObras();
    renderizarIncidencias();
    actualizarSelectoresFichaje();
}

// ========================================================
// 2. NAVEGACIÓN GLOBAL
// ========================================================
const vistasIDs = ["dashboard", "obras", "detalle-obra", "clientes", "detalle-cliente", "incidencias", "detalle-incidencia", "operarios", "detalle-operario", "fichajes", "herramientas", "vehiculos", "calendario", "ajustes"];

window.cambiarVista = (activa) => {
    if (usuarioActivo?.rol === "OPERARIO" && ["dashboard", "clientes", "detalle-cliente", "operarios", "detalle-operario", "ajustes"].includes(activa)) {
        activa = "fichajes";
    }
    vistasIDs.forEach(id => {
        const vista = document.getElementById(`vista-${id}`);
        const nav = document.getElementById(`nav-${id}`);
        if (vista) vista.classList.toggle("hidden", activa !== id);
        if (nav) nav.className = (activa === id || activa === `detalle-${id}`) 
            ? "nav-btn w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-800 text-white font-medium transition" 
            : "nav-btn w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition";
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ========================================================
// 3. UTILIDADES Y CORE
// ========================================================
window.borrarRegistro = async (coleccion, id) => {
    if (confirm("¿Eliminar definitivamente este registro?")) {
        await deleteDoc(doc(db, coleccion, id));
        window.cambiarVista(coleccion);
    }
};

window.generarCabeceraMarcaBlanca = () => {
    const logo = datosEmpresaActual.logo ? `<img src="${datosEmpresaActual.logo}" class="max-h-12">` : `<div class="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center font-black text-slate-950">G</div>`;
    return `<div class="flex justify-between items-center pb-3 border-b-2 border-slate-800 mb-4">
        <div class="flex items-center gap-3">${logo}<div><h2 class="text-lg font-black">${datosEmpresaActual.nombre}</h2><p class="text-[11px] text-slate-500">${datosEmpresaActual.cif}</p></div></div>
    </div>`;
};

window.actualizarDashboard = () => {
    const esOperario = usuarioActivo?.rol === "OPERARIO";
    if (esOperario) return;

    const obrasActivas = cacheObras.filter(o => o.estado === "En curso");
    const incActivas = cacheIncidencias.filter(i => i.estado !== "Resuelta");
    const total = cacheObras.reduce((acc, curr) => acc + (Number(curr.totalPresupuesto) || 0), 0);
    
    if(document.getElementById("dash-total-presupuesto")) document.getElementById("dash-total-presupuesto").textContent = total.toLocaleString('es-ES') + ' €';
    if(document.getElementById("dash-obras-activas")) document.getElementById("dash-obras-activas").textContent = obrasActivas.length;
    if(document.getElementById("dash-incidencias-abiertas")) document.getElementById("dash-incidencias-abiertas").textContent = incActivas.length;
    if(document.getElementById("dash-operarios-total")) document.getElementById("dash-operarios-total").textContent = cacheOperarios.length;
};

// ========================================================
// 4. OBRAS Y PRESUPUESTOS
// ========================================================
let filtroObras = 'todas', obraSel = null;
window.filtrarObras = (est, btn) => { filtroObras = est; if(btn) document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('bg-slate-900', 'text-white')); if(btn) btn.classList.add('bg-slate-900', 'text-white'); renderizarObras(); };

function renderizarObras() {
    const el = document.getElementById("lista-proyectos");
    if (!el) return;
    const esOp = usuarioActivo?.rol === "OPERARIO";
    let lista = esOp ? cacheObras.filter(o => o.operarios?.includes(usuarioActivo.nombre)) : cacheObras;
    lista = filtroObras === 'todas' ? lista : lista.filter(o => o.estado === filtroObras);
    
    el.innerHTML = lista.map(o => `
        <div class="bg-white p-6 rounded-2xl border shadow-sm hover:shadow-md transition">
            <div class="flex justify-between items-start mb-2">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100">${o.estado}</span>
                ${!esOp ? `<span class="text-xs font-bold">${(Number(o.totalPresupuesto)||0).toLocaleString()} €</span>` : ''}
            </div>
            <h3 class="text-base font-bold">${o.nombre}</h3>
            <p class="text-xs text-slate-500 mt-1">📍 ${o.direccion}</p>
            <div class="mt-4 pt-3 border-t flex justify-end">
                <button onclick="window.abrirDetalleObra('${o.id}')" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs shadow-sm">Ver Ficha</button>
            </div>
        </div>
    `).join('') || `<p class="text-slate-500 col-span-full text-center">No hay obras.</p>`;
}

window.abrirDetalleObra = (id) => {
    obraSel = cacheObras.find(o => o.id === id);
    const esOp = usuarioActivo?.rol === "OPERARIO";
    const total = Number(obraSel.totalPresupuesto)||0;
    
    document.getElementById("contenedor-detalle-obra").innerHTML = `
        <div class="bg-white rounded-2xl p-6 border shadow-sm">
            ${window.generarCabeceraMarcaBlanca()}
            <div class="flex justify-between items-start mb-4">
                <div><h1 class="text-2xl font-bold">${obraSel.nombre}</h1><p class="text-sm">📍 ${obraSel.direccion}</p></div>
                ${!esOp ? `<div class="text-right"><span class="text-2xl font-black text-amber-700">${total.toLocaleString()} €</span></div>` : ''}
            </div>
            <div class="grid grid-cols-2 gap-4 mt-4 text-sm">
                <div><strong>Cliente:</strong> ${obraSel.cliente || 'Particular'}</div>
                <div><strong>Fechas:</strong> ${obraSel.fechaInicio || '-'} a ${obraSel.fechaFin || '-'}</div>
            </div>
            ${!esOp ? `
                <div class="mt-6 flex gap-2">
                    <button id="btn-editar-obra-actual" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm" onclick="window.prepararEditarObra('${id}')">Editar</button>
                    <button class="bg-rose-50 text-rose-700 px-4 py-2 rounded-lg text-sm border border-rose-200" onclick="window.borrarRegistro('proyectos', '${id}')">Eliminar</button>
                </div>
            ` : ''}
        </div>
    `;
    window.cambiarVista('detalle-obra');
};

// Logica de Guardado Obra
window.prepararEditarObra = (id) => {
    document.getElementById("edit-obra-id").value = id;
    document.getElementById("input-nombre").value = obraSel.nombre;
    document.getElementById("input-direccion").value = obraSel.direccion;
    document.getElementById("modal-obra").style.display = "flex";
};

document.getElementById("btn-submit-obra")?.addEventListener("click", async () => {
    const nombre = document.getElementById("input-nombre").value.trim();
    const id = document.getElementById("edit-obra-id").value;
    if(!nombre) return alert("El nombre es obligatorio");
    const data = { nombre, direccion: document.getElementById("input-direccion").value, fechaModificacion: serverTimestamp() };
    id ? await updateDoc(doc(db, "proyectos", id), data) : await addDoc(colObras, { ...data, fechaCreacion: serverTimestamp(), estado: "Presupuestada" });
    document.getElementById("modal-obra").style.display = "none";
});

// ========================================================
// 5. INCIDENCIAS Y PARTES
// ========================================================
let filtroInc = 'todas';
window.filtrarIncidencias = (est) => { filtroInc = est; renderizarIncidencias(); };

function renderizarIncidencias() {
    const el = document.getElementById("lista-incidencias");
    if(!el) return;
    const esOp = usuarioActivo?.rol === "OPERARIO";
    let lista = esOp ? cacheIncidencias.filter(i => i.operario === usuarioActivo.nombre) : cacheIncidencias;
    lista = filtroInc === 'todas' ? lista : lista.filter(i => i.estado === filtroInc);
    
    el.innerHTML = lista.map(i => `
        <div class="bg-white p-6 rounded-2xl border shadow-sm cursor-pointer hover:shadow-md" onclick="window.abrirDetalleIncidencia('${i.id}')">
            <span class="px-2 py-1 bg-slate-100 rounded text-xs font-bold">${i.estado}</span>
            <h3 class="font-bold mt-2">${i.titulo}</h3>
            <p class="text-xs mt-1">🏗️ ${i.obra}</p>
        </div>
    `).join('') || `<p class="text-slate-500 text-center col-span-full">No hay incidencias.</p>`;
}

window.abrirDetalleIncidencia = (id) => {
    const inc = cacheIncidencias.find(i => i.id === id);
    document.getElementById("contenedor-detalle-incidencia").innerHTML = `
        <div class="bg-white rounded-2xl p-6 border shadow-sm">
            <h1 class="text-2xl font-bold mb-2">${inc.titulo}</h1>
            <p class="text-sm"><strong>Obra:</strong> ${inc.obra}</p>
            <p class="text-sm"><strong>Responsable:</strong> ${inc.operario || 'Sin asignar'}</p>
            <div class="mt-4"><button class="bg-slate-900 text-white px-4 py-2 rounded" onclick="window.prepararEditarInc('${id}')">Editar Parte</button></div>
        </div>
    `;
    window.cambiarVista('detalle-incidencia');
};

window.prepararEditarInc = (id) => {
    const d = cacheIncidencias.find(i => i.id === id);
    document.getElementById("edit-incidencia-id").value = id;
    document.getElementById("input-titulo-incidencia").value = d.titulo;
    document.getElementById("select-obra-incidencia").value = d.obra;
    document.getElementById("modal-incidencia").style.display = "flex";
};

document.getElementById("btn-guardar-incidencia")?.addEventListener("click", async () => {
    const tit = document.getElementById("input-titulo-incidencia").value;
    const id = document.getElementById("edit-incidencia-id").value;
    const data = { titulo: tit, obra: document.getElementById("select-obra-incidencia").value, fechaModificacion: serverTimestamp() };
    id ? await updateDoc(doc(db, "incidencias", id), data) : await addDoc(colIncidencias, { ...data, estado: "Abierta" });
    document.getElementById("modal-incidencia").style.display = "none";
});

// ========================================================
// 6. OPERARIOS Y FICHAJES
// ========================================================
function renderizarOperarios() {
    const el = document.getElementById("lista-operarios");
    if(el) el.innerHTML = cacheOperarios.map(op => `
        <div class="bg-white p-6 rounded-2xl border shadow-sm">
            <h3 class="font-bold">${op.nombre}</h3><p class="text-xs text-slate-500">${op.oficio}</p>
            <div class="mt-4 flex gap-2"><button onclick="window.borrarRegistro('operarios','${op.id}')" class="text-rose-500 text-xs">Eliminar</button></div>
        </div>
    `).join('') || `<p>Sin operarios.</p>`;
}

document.getElementById("btn-guardar-operario")?.addEventListener("click", async () => {
    const nombre = document.getElementById("input-nombre-operario").value;
    await addDoc(colOperarios, { nombre, dni: document.getElementById("input-dni-operario").value, oficio: document.getElementById("input-oficio-operario").value });
    document.getElementById("modal-operario").style.display = "none";
});

// Fichajes
function actualizarSelectoresFichaje() {
    const sel = document.getElementById("select-operario-fichaje");
    if(sel) {
        sel.innerHTML = `<option value="">Selecciona trabajador...</option>` + cacheOperarios.map(o => `<option value="${o.nombre}">${o.nombre}</option>`).join('');
        if (usuarioActivo?.rol === "OPERARIO") { sel.value = usuarioActivo.nombre; sel.disabled = true; window.verificarEstadoFichajeOperario(); }
    }
}

window.verificarEstadoFichajeOperario = () => {
    const btnEntrada = document.getElementById("btn-fichar-entrada");
    if(!btnEntrada) return;
    const op = document.getElementById("select-operario-fichaje").value;
    const hoyStr = new Date().toISOString().split("T")[0];
    const fh = cacheFichajes.filter(f => f.operario === op && f.fechaStr === hoyStr).sort((a,b)=>b.timestampMs - a.timestampMs);
    const est = fh.length ? fh[0].tipo : "SALIDA";
    
    btnEntrada.disabled = (est === "ENTRADA" || est === "FIN_PAUSA" || est === "INICIO_PAUSA");
    document.getElementById("btn-fichar-salida").disabled = (est === "SALIDA");
};

window.registrarFichaje = async (tipo) => {
    const operario = document.getElementById("select-operario-fichaje").value;
    if(!operario) return alert("Selecciona operario");
    const ahora = new Date();
    await addDoc(colFichajes, { operario, tipo, fechaStr: ahora.toISOString().split("T")[0], horaStr: ahora.toLocaleTimeString(), timestampMs: ahora.getTime() });
};

window.renderizarFichajes = () => {
    const el = document.getElementById("tabla-fichajes-body");
    if(el) el.innerHTML = cacheFichajes.sort((a,b)=>b.timestampMs - a.timestampMs).slice(0,50).map(f => `
        <tr class="border-b"><td class="p-2">${f.fechaStr}</td><td class="p-2 font-bold">${f.operario}</td><td class="p-2">${f.tipo}</td><td class="p-2">${f.horaStr}</td></tr>
    `).join('');
};

// ========================================================
// 7. LISTENERS DE FIRESTORE
// ========================================================
onSnapshot(docConfigEmpresa, (snap) => { if(snap.exists()) datosEmpresaActual = snap.data(); });
onSnapshot(colObras, (snap) => { cacheObras = snap.docs.map(d => ({id: d.id, ...d.data()})); renderizarObras(); actualizarDashboard(); });
onSnapshot(colIncidencias, (snap) => { cacheIncidencias = snap.docs.map(d => ({id: d.id, ...d.data()})); renderizarIncidencias(); actualizarDashboard(); });
onSnapshot(colOperarios, (snap) => { cacheOperarios = snap.docs.map(d => ({id: d.id, ...d.data()})); renderizarOperarios(); actualizarSelectoresFichaje(); });
onSnapshot(colFichajes, (snap) => { cacheFichajes = snap.docs.map(d => ({id: d.id, ...d.data()})); window.renderizarFichajes(); window.verificarEstadoFichajeOperario(); });
onSnapshot(colClientes, (snap) => { cacheClientes = snap.docs.map(d => ({id: d.id, ...d.data()})); });

// Inicializar
aplicarSesionUsuario();
