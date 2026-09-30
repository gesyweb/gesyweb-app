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
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.log('SW registration failed:', err);
        });
    });
}

// Colecciones
const colObras = collection(db, "proyectos");
const colClientes = collection(db, "clientes");
const colIncidencias = collection(db, "incidencias");
const colOperarios = collection(db, "operarios");
const colHerramientas = collection(db, "herramientas");
const docConfigEmpresa = doc(db, "configuracion", "empresa");
const colVehiculos = collection(db, "vehiculos"); 
const colFichajes = collection(db, "fichajes");

// Cachés globales
let cacheFichajes = [];
let cacheVehiculos = [];
let cacheObras = [];
let cacheClientes = [];
let cacheIncidencias = [];
let cacheOperarios = [];
let cacheHerramientas = [];

let datosEmpresaActual = {
    nombre: "Gesyweb Reformas",
    cif: "",
    telefono: "",
    email: "",
    direccion: "",
    logo: "",
    claveAdmin: "admin1234"
};

// ========================================================
// 1. SISTEMA DE AUTENTICACIÓN (RBAC)
// ========================================================
let usuarioActivo = JSON.parse(localStorage.getItem("gesyweb_usuario_activo") || "null");

window.conmutarTabLogin = (tab) => {
    const btnGer = document.getElementById("tab-login-gerencia");
    const btnOpe = document.getElementById("tab-login-operario");
    const fGer = document.getElementById("form-login-gerencia");
    const fOpe = document.getElementById("form-login-operario");
    const err = document.getElementById("login-error-msg");
    if (err) err.classList.add("hidden");

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
            err.textContent = "Credenciales de oficina incorrectas. Verifica usuario o clave.";
            err.classList.remove("hidden");
        }
    } else {
        const nom = document.getElementById("login-operario-nombre").value.trim().toLowerCase();
        const dni = document.getElementById("login-operario-dni").value.trim().toUpperCase().replace(/[\s-]/g, "");

        if (!nom || !dni) {
            err.textContent = "Introduce tu nombre completo y tu DNI/NIE.";
            err.classList.remove("hidden");
            return;
        }

        const encontrado = cacheOperarios.find(o => {
            const dniLimpio = (o.dni || "").toUpperCase().replace(/[\s-]/g, "");
            return o.nombre && o.nombre.trim().toLowerCase() === nom && dniLimpio === dni;
        });

        if (encontrado) {
            usuarioActivo = { rol: "OPERARIO", nombre: encontrado.nombre, idOperario: encontrado.id };
            localStorage.setItem("gesyweb_usuario_activo", JSON.stringify(usuarioActivo));
            aplicarSesionUsuario();
        } else {
            err.textContent = "Operario no encontrado o DNI incorrecto. Solicita tu alta a Gerencia.";
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
    if (!usuarioActivo) {
        modal.classList.remove("hidden");
        return;
    }
    modal.classList.add("hidden");

    const badge = document.getElementById("badge-rol-usuario");
    const nom = document.getElementById("nombre-usuario-sesion");
    if (badge) {
        badge.textContent = usuarioActivo.rol;
        badge.className = usuarioActivo.rol === "GERENCIA"
            ? "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30"
            : "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30";
    }
    if (nom) nom.textContent = usuarioActivo.nombre;

    const navDash = document.getElementById("nav-dashboard");
    const navCli = document.getElementById("nav-clientes");
    const navOp = document.getElementById("nav-operarios");
    const navAj = document.getElementById("nav-ajustes");
    const btnNuevaObra = document.getElementById("btn-abrir-modal-obra");

    if (usuarioActivo.rol === "OPERARIO") {
        if (navDash) navDash.classList.add("hidden");
        if (navCli) navCli.classList.add("hidden");
        if (navOp) navOp.classList.add("hidden");
        if (navAj) navAj.classList.add("hidden");
        if (btnNuevaObra) btnNuevaObra.classList.add("hidden");
        window.cambiarVista('fichajes');
    } else {
        if (navDash) navDash.classList.remove("hidden");
        if (navCli) navCli.classList.remove("hidden");
        if (navOp) navOp.classList.remove("hidden");
        if (navAj) navAj.classList.remove("hidden");
        if (btnNuevaObra) btnNuevaObra.classList.remove("hidden");
        window.cambiarVista('dashboard');
    }

    if (typeof renderizarObras === 'function') renderizarObras();
    if (typeof renderizarIncidencias === 'function') renderizarIncidencias();
    if (typeof actualizarSelectoresFichaje === 'function') actualizarSelectoresFichaje();
}

// ========================================================
// 2. NAVEGACIÓN Y VISTAS
// ========================================================
const vistas = {
    dashboard: document.getElementById("vista-dashboard"),
    calendario: document.getElementById("vista-calendario"),
    fichajes: document.getElementById("vista-fichajes"),
    obras: document.getElementById("vista-obras"),
    detalleObra: document.getElementById("vista-detalle-obra"),
    clientes: document.getElementById("vista-clientes"),
    detalleCliente: document.getElementById("vista-detalle-cliente"),
    incidencias: document.getElementById("vista-incidencias"),
    detalleIncidencia: document.getElementById("vista-detalle-incidencia"),
    operarios: document.getElementById("vista-operarios"),
    detalleOperario: document.getElementById("vista-detalle-operario"),
    herramientas: document.getElementById("vista-herramientas"),
    vehiculos: document.getElementById("vista-vehiculos"),
    ajustes: document.getElementById("vista-ajustes")
};

const botonesNav = {
    dashboard: document.getElementById("nav-dashboard"),
    calendario: document.getElementById("nav-calendario"),
    fichajes: document.getElementById("nav-fichajes"),
    obras: document.getElementById("nav-obras"),
    clientes: document.getElementById("nav-clientes"),
    incidencias: document.getElementById("nav-incidencias"),
    operarios: document.getElementById("nav-operarios"),
    herramientas: document.getElementById("nav-herramientas"),
    vehiculos: document.getElementById("nav-vehiculos"),
    ajustes: document.getElementById("nav-ajustes")
};

window.cambiarVista = (activa) => {
    if (usuarioActivo && usuarioActivo.rol === "OPERARIO") {
        if (["dashboard", "clientes", "detalleCliente", "operarios", "detalleOperario", "ajustes"].includes(activa)) {
            activa = "fichajes";
        }
    }

    Object.keys(vistas).forEach(k => {
        if (vistas[k]) {
            if (k === activa) {
                vistas[k].classList.remove("hidden");
                if (botonesNav[k]) {
                    botonesNav[k].className = "nav-btn w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-800 text-white font-medium transition";
                }
            } else {
                vistas[k].classList.add("hidden");
                if (botonesNav[k]) {
                    botonesNav[k].className = "nav-btn w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition";
                }
            }
        }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ========================================================
// 3. ACTUALIZACIÓN DEL DASHBOARD Y LISTENERS DE COLECCIONES
// ========================================================
window.actualizarDashboard = () => {
    const totalPresupuestado = cacheObras.reduce((acc, curr) => acc + (Number(curr.totalPresupuesto) || Number(curr.presupuesto) || 0), 0);
    const obrasActivas = cacheObras.filter(o => o.estado === "En curso");

    const elPresupuesto = document.getElementById("dash-total-presupuesto");
    const elObrasActivas = document.getElementById("dash-obras-activas");
    if (elPresupuesto) elPresupuesto.textContent = totalPresupuestado.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
    if (elObrasActivas) elObrasActivas.textContent = obrasActivas.length;

    const incPendientes = cacheIncidencias.filter(i => i.estado === "Abierta" || i.estado === "En curso");
    const elInc = document.getElementById("dash-incidencias-abiertas");
    if (elInc) elInc.textContent = incPendientes.length;

    const elOp = document.getElementById("dash-operarios-total");
    if (elOp) elOp.textContent = cacheOperarios.length;

    const elVeh = document.getElementById("dash-vehiculos-total");
    if (elVeh) {
        const activas = cacheVehiculos.filter(v => v.estado === "Operativa").length;
        elVeh.textContent = cacheVehiculos.length > 0 ? activas + ' / ' + cacheVehiculos.length : '0';
    }

    const cIncDash = document.getElementById("dash-lista-incidencias");
    if (cIncDash) {
        if (incPendientes.length === 0) {
            cIncDash.innerHTML = '<p class="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border">No hay incidencias pendientes de resolver. ¡Todo al día!</p>';
        } else {
            cIncDash.innerHTML = incPendientes.slice(0, 4).map(i => {
                let bUrg = i.prioridad === "Urgente" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800";
                return `<div class="flex items-center justify-between p-3 bg-slate-50 border rounded-xl hover:bg-rose-50/50 transition cursor-pointer" onclick="window.abrirDetalleIncidencia('${i.id}')">
                    <div>
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${bUrg}">${i.prioridad}</span>
                            <span class="text-xs font-bold text-slate-800">${i.titulo}</span>
                        </div>
                        <p class="text-[11px] text-slate-500">🏗️ ${i.obra} • 👷 ${i.operario || 'Sin asignar'}</p>
                    </div>
                    <span class="text-xs text-rose-600 font-bold">Ver →</span>
                </div>`;
            }).join('');
        }
    }

    const cObrasDash = document.getElementById("dash-lista-obras");
    if (cObrasDash) {
        if (obrasActivas.length === 0) {
            cObrasDash.innerHTML = '<p class="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border">No hay obras en ejecución en este momento.</p>';
        } else {
            cObrasDash.innerHTML = obrasActivas.slice(0, 4).map(o => {
                const precio = (Number(o.totalPresupuesto) || Number(o.presupuesto) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
                return `<div class="flex items-center justify-between p-3 bg-slate-50 border rounded-xl hover:bg-amber-50/50 transition cursor-pointer" onclick="window.abrirDetalleObra('${o.id}')">
                    <div>
                        <h4 class="text-xs sm:text-sm font-bold text-slate-900">${o.nombre}</h4>
                        <p class="text-[11px] text-slate-500">👤 ${o.cliente || 'Particular'} • 📍 ${o.direccion || 'Sin dirección'}</p>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-black text-slate-800">${precio}</span>
                        <p class="text-[10px] text-amber-700 font-semibold">Detalle →</p>
                    </div>
                </div>`;
            }).join('');
        }
    }
};

window.borrarRegistro = async (coleccion, id) => {
    if (confirm("¿Estás seguro de que deseas eliminar este registro?")) {
        await deleteDoc(doc(db, coleccion, id));
        window.cambiarVista(coleccion); // Vuelve al listado
    }
};

window.generarCabeceraMarcaBlanca = () => {
    let logoHtml = '<div class="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center font-black text-slate-950 text-xl">G</div>';
    if (datosEmpresaActual.logo) {
        logoHtml = `<img src="${datosEmpresaActual.logo}" class="max-h-12 w-auto object-contain">`;
    }
    return `<div class="flex justify-between items-center pb-3 border-b-2 border-slate-800 mb-4">
        <div class="flex items-center gap-3">
            ${logoHtml}
            <div>
                <h2 class="text-lg font-black text-slate-900 leading-tight">${datosEmpresaActual.nombre || 'Gesyweb'}</h2>
                <p class="text-[11px] text-slate-500">${datosEmpresaActual.cif ? 'CIF: ' + datosEmpresaActual.cif + ' • ' : ''}${datosEmpresaActual.direccion || ''}</p>
            </div>
        </div>
        <div class="text-right text-[11px] text-slate-600">
            ${datosEmpresaActual.telefono ? '<p>📞 ' + datosEmpresaActual.telefono + '</p>' : ''}
            ${datosEmpresaActual.email ? '<p>✉️ ' + datosEmpresaActual.email + '</p>' : ''}
        </div>
    </div>`;
};

// Listeners de Firestore
onSnapshot(docConfigEmpresa, (snapshot) => {
    if (snapshot.exists()) {
        datosEmpresaActual = snapshot.data();
        const inpNom = document.getElementById("empresa-nombre");
        const inpCif = document.getElementById("empresa-cif");
        const inpTel = document.getElementById("empresa-tel");
        const inpEml = document.getElementById("empresa-email");
        const inpDir = document.getElementById("empresa-direccion");
        const pLogo = document.getElementById("preview-logo-empresa");
        const inpClave = document.getElementById("empresa-clave-admin");

        if (inpNom) inpNom.value = datosEmpresaActual.nombre || "";
        if (inpCif) inpCif.value = datosEmpresaActual.cif || "";
        if (inpTel) inpTel.value = datosEmpresaActual.telefono || "";
        if (inpEml) inpEml.value = datosEmpresaActual.email || "";
        if (inpDir) inpDir.value = datosEmpresaActual.direccion || "";
        if (inpClave) inpClave.value = datosEmpresaActual.claveAdmin || "admin1234";
        if (pLogo && datosEmpresaActual.logo) {
            pLogo.innerHTML = `<img src="${datosEmpresaActual.logo}" class="w-full h-full object-contain">`;
        }
    }
});

onSnapshot(colObras, (snap) => {
    cacheObras = [];
    snap.forEach(docSnap => {
        cacheObras.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (typeof renderizarObras === 'function') renderizarObras();
    window.actualizarDashboard();
    if (typeof actualizarSelectoresFichaje === 'function') actualizarSelectoresFichaje();
});

onSnapshot(colIncidencias, (snap) => {
    cacheIncidencias = [];
    snap.forEach(docSnap => {
        cacheIncidencias.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (typeof renderizarIncidencias === 'function') renderizarIncidencias();
    window.actualizarDashboard();
});

onSnapshot(colOperarios, (snap) => {
    cacheOperarios = [];
    snap.forEach(docSnap => {
        cacheOperarios.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (typeof renderizarOperarios === 'function') renderizarOperarios();
    window.actualizarDashboard();
    if (typeof actualizarSelectoresFichaje === 'function') actualizarSelectoresFichaje();
});

onSnapshot(colFichajes, (snap) => {
    cacheFichajes = [];
    snap.forEach(docSnap => {
        cacheFichajes.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (typeof window.renderizarFichajes === 'function') window.renderizarFichajes();
    if (typeof window.verificarEstadoFichajeOperario === 'function') window.verificarEstadoFichajeOperario();
});

onSnapshot(colClientes, (snap) => {
    cacheClientes = [];
    snap.forEach(docSnap => {
        cacheClientes.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (typeof renderizarClientes === 'function') renderizarClientes();
});

onSnapshot(colHerramientas, (snap) => {
    cacheHerramientas = [];
    snap.forEach(docSnap => {
        cacheHerramientas.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (typeof renderizarHerramientas === 'function') renderizarHerramientas();
});

onSnapshot(colVehiculos, (snap) => {
    cacheVehiculos = [];
    snap.forEach(docSnap => {
        cacheVehiculos.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (typeof renderizarVehiculos === 'function') renderizarVehiculos();
    window.actualizarDashboard();
});

// Inicialización de la sesión al arrancar la app
aplicarSesionUsuario();

// Funciones globales (renderizado y lógica de guardado), puedes migrar los bloques específicos 
// (fichajes, obras, clientes, etc.) aquí, respetando exactamente la estructura de los scripts que te envié anteriormente.
