/* ===========================================================
   Alfabetización Informática – SENA
   Script compartido por TODAS las páginas.
   Cada bloque se activa solo si encuentra los elementos que
   necesita, así este mismo archivo sirve para index.html
   (login + panel admin) y para las páginas de módulo
   (mostrar la actividad guardada por el profesor).
   =========================================================== */
(function(){

  const firebaseConfig = {
    apiKey: "AIzaSyC4YXlBzD-i2Vz5oiBPVDB8GIYOc_o8qbo",
    authDomain: "alfabetiza-3e47c.firebaseapp.com",
    projectId: "alfabetiza-3e47c",
    storageBucket: "alfabetiza-3e47c.firebasestorage.app",
    messagingSenderId: "558880023064",
    appId: "1:558880023064:web:44ad7829d41e0d3993596d"
  };
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  // auth solo existe en páginas que cargan firebase-auth-compat.js (index.html)
  const auth = (typeof firebase.auth === 'function') ? firebase.auth() : null;
  // storage solo existe en páginas que cargan firebase-storage-compat.js (páginas de módulo)
  const storage = (typeof firebase.storage === 'function') ? firebase.storage() : null;

  /* =======================================================
     BLOQUE 1 · Páginas de módulo: mostrar actividad guardada
     (encender-apagar, pantalla-tactil, wifi, apps, nequi, hotmail)
     Se activa si el body trae data-activity="id-del-modulo"
     ======================================================= */
  const activityId = document.body.dataset.activity;
  if (activityId && document.getElementById('taskText')) {
    const emoji = document.body.dataset.emoji || '📌';
    db.collection('actividades').doc(activityId).get().then(doc=>{
      if (doc.exists) {
        const data = doc.data();
        if (data.texto) {
          document.getElementById('taskText').textContent = emoji + ' ' + data.texto;
        }
        const grid = document.getElementById('taskImages');
        (data.imagenes || []).forEach(src=>{
          const item = document.createElement('div');
          item.className = 'preview-item';
          const img = document.createElement('img');
          img.src = src;
          item.appendChild(img);
          grid.appendChild(item);
        });
      }
    }).catch(()=>{ /* si falla, se queda el texto de ejemplo por defecto */ });
  }

  /* =======================================================
     BLOQUE 1B · Páginas de módulo: el aprendiz sube su evidencia
     y ve la nota cuando el profesor la califica.
     Se activa si existe el formulario #formEntrega.
     ======================================================= */
  const formEntrega = document.getElementById('formEntrega');
  if (activityId && formEntrega) {
    const cedulaInput = document.getElementById('entregaCedula');
    const archivosInput = document.getElementById('entregaArchivos');
    const previewGrid = document.getElementById('entregaPreview');
    const msgEntrega = document.getElementById('msgEntrega');
    const gradeBanner = document.getElementById('gradeBanner');
    const gradeValue = document.getElementById('gradeValue');
    const gradeComment = document.getElementById('gradeComment');

    let archivosSeleccionados = []; // File objects reales, pendientes de subir
    let unsubMiEntrega = null;
    const btnEnviar = formEntrega.querySelector('button[type="submit"]');

    /* ---------- Ayudas para reconocer imágenes ----------
       Algunos celulares (Android/Samsung/iPhone) entregan la foto con
       file.type vacío o como HEIC. Aquí lo detectamos también por extensión. */
    const MIME_POR_EXT = {
      jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif',
      webp:'image/webp', heic:'image/heic', heif:'image/heif', bmp:'image/bmp', avif:'image/avif'
    };
    function extension(nombre){
      const m = /\.([a-z0-9]+)$/i.exec(nombre || '');
      return m ? m[1].toLowerCase() : '';
    }
    function tipoImagen(file){
      if (file.type && file.type.startsWith('image/')) return file.type;
      if (!file.type) return MIME_POR_EXT[extension(file.name)] || '';
      return ''; // tiene un tipo que no es imagen
    }

    function renderEntregaPreview(){
      previewGrid.innerHTML = '';
      archivosSeleccionados.forEach((file, i)=>{
        const item = document.createElement('div');
        item.className = 'preview-item';
        const urlPrevia = URL.createObjectURL(file);
        const img = document.createElement('img');
        img.src = urlPrevia;
        img.alt = file.name;
        // si el navegador no puede mostrar la foto (p. ej. HEIC), mostramos el nombre
        img.onerror = ()=>{
          img.remove();
          item.classList.add('preview-file');
          item.insertBefore(document.createTextNode(file.name), item.firstChild);
        };
        item.appendChild(img);
        const btn = document.createElement('button');
        btn.type = 'button'; // evita que el ✕ envíe el formulario
        btn.textContent = '✕';
        btn.onclick = ()=>{
          URL.revokeObjectURL(urlPrevia);
          archivosSeleccionados.splice(i,1);
          renderEntregaPreview();
        };
        item.appendChild(btn);
        previewGrid.appendChild(item);
      });
    }

    function escucharMiEntrega(cedula){
      if (unsubMiEntrega) unsubMiEntrega();
      const docId = activityId + '_' + cedula;
      unsubMiEntrega = db.collection('entregas').doc(docId).onSnapshot(doc=>{
        if (doc.exists && doc.data().calificado) {
          const data = doc.data();
          gradeBanner.hidden = false;
          gradeValue.textContent = data.nota;
          gradeComment.textContent = data.comentario || '';
        } else {
          gradeBanner.hidden = true;
        }
      }, ()=>{ /* si falla el permiso, simplemente no se muestra la nota */ });
    }

    const cedulaGuardada = localStorage.getItem('alfabetiza_cedula');
    if (cedulaGuardada) {
      cedulaInput.value = cedulaGuardada;
      escucharMiEntrega(cedulaGuardada);
    }

    archivosInput.addEventListener('change', (e)=>{
      const nuevos = Array.from(e.target.files);
      let rechazados = 0;
      nuevos.forEach(file=>{
        if (!tipoImagen(file)) { rechazados++; return; } // solo imágenes
        archivosSeleccionados.push(file);
      });
      if (rechazados) {
        msgEntrega.textContent = 'Solo se permiten imágenes (JPG, PNG, WEBP...).';
        msgEntrega.className = 'form-msg error';
      } else {
        msgEntrega.textContent = '';
      }
      renderEntregaPreview();
      e.target.value = '';
    });

    /* La evidencia se guarda directamente en Firestore (igual que las imágenes
       que sube el profesor), como imagen JPG en texto base64. Firestore limita
       cada documento a ~1 MB, así que se comprime cada foto hasta que quepa. */
    const MAX_CHARS_DOC = 850000; // presupuesto total por entrega (límite real: 1.048.576)
    const MAX_IMAGENES = 5;

    function cargarImagen(file){
      return new Promise((resolve, reject)=>{
        const url = URL.createObjectURL(file);
        const img = new Image();
        const timer = setTimeout(()=>{ URL.revokeObjectURL(url); reject({ code:'imagen/timeout' }); }, 20000);
        img.onload = ()=>{ clearTimeout(timer); URL.revokeObjectURL(url); resolve(img); };
        img.onerror = ()=>{ clearTimeout(timer); URL.revokeObjectURL(url); reject({ code:'imagen/ilegible' }); };
        img.src = url;
      });
    }

    // Convierte la foto en un data URL JPG que no pase de maxChars caracteres
    async function imagenADataUrl(file, maxChars){
      const img = await cargarImagen(file);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const mayor = Math.max(img.naturalWidth, img.naturalHeight) || 1;
      const dimensiones = [1280, 1024, 800, 640, 480];
      const calidades = [0.8, 0.65, 0.5, 0.4, 0.3];
      for (const dim of dimensiones) {
        const escala = Math.min(1, dim / mayor);
        const w = Math.max(1, Math.round(img.naturalWidth * escala));
        const h = Math.max(1, Math.round(img.naturalHeight * escala));
        canvas.width = w; canvas.height = h;
        ctx.fillStyle = '#fff';               // fondo blanco (para PNG con transparencia)
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        for (const q of calidades) {
          const dataUrl = canvas.toDataURL('image/jpeg', q);
          if (dataUrl.length <= maxChars) return dataUrl;
        }
      }
      throw { code:'imagen/muy-grande' };
    }

    function textoError(err){
      const code = (err && err.code) || '';
      if (code === 'imagen/ilegible') {
        return 'No se pudo leer una de las imágenes. Usa una captura de pantalla o foto en JPG/PNG e inténtalo de nuevo.';
      }
      if (code === 'imagen/timeout') {
        return 'Una de las imágenes tardó demasiado en procesarse. Inténtalo de nuevo con una imagen más liviana.';
      }
      if (code === 'imagen/muy-grande') {
        return 'No se pudo reducir una imagen lo suficiente. Elige una imagen más pequeña o envía menos imágenes.';
      }
      if (code === 'permission-denied') {
        return 'Error (permission-denied): no tienes permiso para guardar la entrega. Avisa a tu profesor para revisar las reglas de Firestore.';
      }
      if (code === 'unavailable') {
        return 'Error (unavailable): sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
      }
      return 'Error (' + code + '): ' + ((err && err.message) || err);
    }

    formEntrega.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const cedula = cedulaInput.value.trim();
      if (!cedula) return;
      if (!archivosSeleccionados.length) {
        msgEntrega.textContent = 'Adjunta al menos una imagen antes de enviar.';
        msgEntrega.className = 'form-msg error';
        return;
      }
      if (archivosSeleccionados.length > MAX_IMAGENES) {
        msgEntrega.textContent = 'Puedes enviar máximo ' + MAX_IMAGENES + ' imágenes. Quita las que sobren con la ✕.';
        msgEntrega.className = 'form-msg error';
        return;
      }
      const docId = activityId + '_' + cedula;
      if (btnEnviar) btnEnviar.disabled = true;
      msgEntrega.textContent = 'Preparando envío...'; msgEntrega.className = 'form-msg';
      try{
        const archivosSubidos = [];
        const presupuesto = Math.floor(MAX_CHARS_DOC / archivosSeleccionados.length);
        for (let i = 0; i < archivosSeleccionados.length; i++) {
          msgEntrega.textContent = 'Procesando imagen ' + (i + 1) + ' de ' + archivosSeleccionados.length + '...';
          const file = archivosSeleccionados[i];
          const dataUrl = await imagenADataUrl(file, presupuesto);
          const nombre = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
          archivosSubidos.push({ nombre: nombre, tipo: 'image/jpeg', url: dataUrl });
        }
        msgEntrega.textContent = 'Guardando...'; msgEntrega.className = 'form-msg';
        await db.collection('entregas').doc(docId).set({
          cedula: cedula,
          actividadId: activityId,
          archivos: archivosSubidos,
          fecha: firebase.firestore.FieldValue.serverTimestamp(),
          nota: null,
          comentario: null,
          calificado: false
        });
        localStorage.setItem('alfabetiza_cedula', cedula);
        msgEntrega.textContent = '¡Evidencia enviada! Tu profesor la revisará pronto.';
        msgEntrega.className = 'form-msg ok';
        archivosSeleccionados = [];
        renderEntregaPreview();
        escucharMiEntrega(cedula);
      } catch(err){
        console.error('Error al enviar evidencia:', err);
        msgEntrega.textContent = textoError(err);
        msgEntrega.className = 'form-msg error';
      } finally {
        if (btnEnviar) btnEnviar.disabled = false;
      }
    });
  }

  /* =======================================================
     BLOQUE 2 · Página de inicio: pestañas de acceso
     ======================================================= */
  const tabs = document.querySelectorAll('.tab-btn');
  const panelEst = document.getElementById('panel-estudiante');
  const panelProf = document.getElementById('panel-profesor');
  if (tabs.length && panelEst && panelProf) {
    tabs.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        tabs.forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const t = btn.dataset.tab;
        panelEst.hidden = t !== 'estudiante';
        panelProf.hidden = t !== 'profesor';
      });
    });
  }

  const cursoSection = document.getElementById('cursoContenido');
  const welcomeBanner = document.getElementById('welcomeBanner');
  const adminPanel = document.getElementById('adminPanel');
  const accessSection = document.getElementById('access');

  function mostrarCurso(mensaje){
    if (!cursoSection || !welcomeBanner) return;
    cursoSection.hidden = false;
    welcomeBanner.textContent = mensaje;
    welcomeBanner.classList.add('show');
    cursoSection.scrollIntoView({behavior:'smooth'});
  }

  /* --- Sesión del estudiante: se recuerda hasta que él pulse "Cerrar sesión" --- */
  const SESION_CEDULA = 'alfabetiza_cedula';
  const SESION_NOMBRE = 'alfabetiza_nombre';

  async function restaurarSesionEstudiante(){
    if (!cursoSection) return;                       // solo en index.html
    const cedula = localStorage.getItem(SESION_CEDULA);
    if (!cedula) return;
    let nombre = localStorage.getItem(SESION_NOMBRE) || '';
    try{
      const doc = await db.collection('cedulas').doc(cedula).get();
      if (!doc.exists) {                             // el profesor la quitó de la lista
        localStorage.removeItem(SESION_CEDULA);
        localStorage.removeItem(SESION_NOMBRE);
        return;
      }
      nombre = doc.data().nombre || nombre;
    } catch(e){ /* sin conexión: se mantiene la sesión guardada */ }
    if (accessSection) accessSection.hidden = true;
    mostrarCurso('¡Bienvenido/a' + (nombre ? ', ' + nombre : '') + '! Ya puedes ver el contenido del curso.');
  }

  function cerrarSesion(){
    localStorage.removeItem(SESION_CEDULA);
    localStorage.removeItem(SESION_NOMBRE);
    if (auth && auth.currentUser) auth.signOut();
    if (cursoSection) cursoSection.hidden = true;
    if (adminPanel) adminPanel.hidden = true;
    if (welcomeBanner) welcomeBanner.classList.remove('show');
    if (accessSection) { accessSection.hidden = false; accessSection.scrollIntoView({behavior:'smooth'}); }
    const ci = document.getElementById('cedulaInput'); if (ci) ci.value = '';
    const me = document.getElementById('msgEstudiante'); if (me) { me.textContent = ''; me.className = 'form-msg'; }
  }

  const btnCerrarSesion = document.getElementById('btnCerrarSesion');
  if (btnCerrarSesion) btnCerrarSesion.addEventListener('click', cerrarSesion);

  // En las páginas de módulo: botón "Cerrar sesión" en la barra superior
  (function(){
    if (!document.body.dataset.activity) return;
    if (!localStorage.getItem(SESION_CEDULA)) return;
    const wrap = document.querySelector('.topbar .wrap');
    if (!wrap) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Cerrar sesión';
    b.style.cssText = 'background:none;border:1px solid rgba(255,255,255,.5);color:inherit;border-radius:999px;padding:3px 14px;cursor:pointer;font:inherit;font-size:14px;';
    b.addEventListener('click', ()=>{
      localStorage.removeItem(SESION_CEDULA);
      localStorage.removeItem(SESION_NOMBRE);
      window.location.href = 'index.html';
    });
    wrap.appendChild(b);
  })();

  /* --- Login estudiante (verifica cédula en Firestore) --- */
  const formEstudiante = document.getElementById('formEstudiante');
  if (formEstudiante) {
    formEstudiante.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const cedula = document.getElementById('cedulaInput').value.trim();
      const msg = document.getElementById('msgEstudiante');
      msg.textContent = 'Verificando...'; msg.className = 'form-msg';
      try{
        const doc = await db.collection('cedulas').doc(cedula).get();
        if(doc.exists){
          const nombre = doc.data().nombre;
          msg.textContent = '¡Acceso concedido!'; msg.className = 'form-msg ok';
          localStorage.setItem(SESION_CEDULA, cedula);
          localStorage.setItem(SESION_NOMBRE, nombre || '');
          if (accessSection) accessSection.hidden = true;
          mostrarCurso('¡Bienvenido/a' + (nombre ? ', ' + nombre : '') + '! Ya puedes ver el contenido del curso.');
        } else {
          msg.textContent = 'Esa cédula no está autorizada. Contacta a tu profesor.'; msg.className = 'form-msg error';
        }
      } catch(err){
        msg.textContent = 'Error (' + err.code + '): ' + err.message; msg.className = 'form-msg error';
      }
    });
  }

  restaurarSesionEstudiante();

  /* --- Login profesor (Firebase Auth) --- */
  const formProfesor = document.getElementById('formProfesor');
  if (formProfesor && auth) {
    formProfesor.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const email = document.getElementById('adminEmail').value.trim();
      const pass = document.getElementById('adminPass').value;
      const msg = document.getElementById('msgProfesor');
      msg.textContent = 'Iniciando sesión...'; msg.className = 'form-msg';
      try{
        await auth.signInWithEmailAndPassword(email, pass);
      } catch(err){
        msg.textContent = 'Error (' + err.code + '): ' + err.message; msg.className = 'form-msg error';
      }
    });

    auth.onAuthStateChanged(user=>{
      if(user){
        if (accessSection) accessSection.hidden = true;
        if (adminPanel) adminPanel.hidden = false;
        mostrarCurso('Sesión de administrador iniciada.');
        escucharCedulas();
        cargarActividad();
        if (typeof renderEntregas === 'function') renderEntregas();
      } else {
        if (adminPanel) adminPanel.hidden = true;
      }
    });
  }

  const btnCerrarSesionAdmin = document.getElementById('btnCerrarSesionAdmin');
  if (btnCerrarSesionAdmin && auth) {
    btnCerrarSesionAdmin.addEventListener('click', ()=>{
      localStorage.removeItem(SESION_CEDULA);
      localStorage.removeItem(SESION_NOMBRE);
      auth.signOut();
      if (accessSection) accessSection.hidden = false;
      if (adminPanel) adminPanel.hidden = true;
      if (cursoSection) cursoSection.hidden = true;
      if (welcomeBanner) welcomeBanner.classList.remove('show');
    });
  }

  /* =======================================================
     BLOQUE 3 · Panel admin: cédulas autorizadas
     ======================================================= */
  const formAgregarCedula = document.getElementById('formAgregarCedula');
  if (formAgregarCedula) {
    formAgregarCedula.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const cedula = document.getElementById('nuevaCedula').value.trim();
      const nombre = document.getElementById('nuevoNombre').value.trim();
      if(!cedula) return;
      await db.collection('cedulas').doc(cedula).set({ nombre: nombre || null, fecha: firebase.firestore.FieldValue.serverTimestamp() });
      document.getElementById('nuevaCedula').value = '';
      document.getElementById('nuevoNombre').value = '';
    });
  }

  function escucharCedulas(){
    const ul = document.getElementById('listaCedulas');
    if (!ul) return;
    db.collection('cedulas').onSnapshot(snapshot=>{
      ul.innerHTML = '';
      snapshot.forEach(doc=>{
        const data = doc.data();
        const li = document.createElement('li');
        li.innerHTML = '<span>' + doc.id + (data.nombre ? ' · ' + data.nombre : '') + '</span>';
        const btn = document.createElement('button');
        btn.textContent = 'Eliminar';
        btn.onclick = ()=> db.collection('cedulas').doc(doc.id).delete();
        li.appendChild(btn);
        ul.appendChild(li);
      });
    });
  }

  /* =======================================================
     BLOQUE 4 · Panel admin: actividades de los módulos
     (texto + imágenes), una por selector
     ======================================================= */
  let actividadImagenes = [];
  const selectorActividad = document.getElementById('actividadSelector');

  function renderActividadPreview(){
    const grid = document.getElementById('actividadPreview');
    if (!grid) return;
    grid.innerHTML = '';
    actividadImagenes.forEach((dataUrl, i)=>{
      const item = document.createElement('div');
      item.className = 'preview-item';
      const img = document.createElement('img');
      img.src = dataUrl;
      const btn = document.createElement('button');
      btn.textContent = '✕';
      btn.onclick = ()=>{ actividadImagenes.splice(i,1); renderActividadPreview(); };
      item.appendChild(img); item.appendChild(btn);
      grid.appendChild(item);
    });
  }

  const actividadImagenesInput = document.getElementById('actividadImagenes');
  if (actividadImagenesInput) {
    actividadImagenesInput.addEventListener('change', (e)=>{
      Array.from(e.target.files).forEach(file=>{
        if(!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = ev=>{ actividadImagenes.push(ev.target.result); renderActividadPreview(); };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    });
  }

  async function cargarActividad(){
    if (!selectorActividad) return;
    const id = selectorActividad.value;
    document.getElementById('actividadTexto').value = '';
    actividadImagenes = [];
    renderActividadPreview();
    try{
      const doc = await db.collection('actividades').doc(id).get();
      if(doc.exists){
        const data = doc.data();
        document.getElementById('actividadTexto').value = data.texto || '';
        actividadImagenes = data.imagenes || [];
        renderActividadPreview();
      }
    } catch(err){ /* aún no existe, se crea al guardar */ }
  }

  if (selectorActividad) {
    selectorActividad.addEventListener('change', cargarActividad);
  }

  const formActividad = document.getElementById('formActividad');
  if (formActividad) {
    formActividad.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const id = selectorActividad.value;
      const texto = document.getElementById('actividadTexto').value.trim();
      const msg = document.getElementById('msgActividad');
      msg.textContent = 'Guardando...'; msg.className = 'form-msg';
      try{
        await db.collection('actividades').doc(id).set({
          texto: texto,
          imagenes: actividadImagenes,
          actualizado: firebase.firestore.FieldValue.serverTimestamp()
        });
        msg.textContent = 'Actividad guardada.'; msg.className = 'form-msg ok';
      } catch(err){
        msg.textContent = 'Error (' + err.code + '): ' + err.message; msg.className = 'form-msg error';
      }
    });
  }

  /* =======================================================
     BLOQUE 5 · Panel admin: ver, descargar y calificar
     las entregas de los aprendices, por módulo.
     ======================================================= */
  const entregaSelector = document.getElementById('entregaSelector');
  const listaEntregas = document.getElementById('listaEntregas');
  let unsubEntregas = null;

  /* ---- Visor grande de evidencias (el profesor hace clic en la imagen) ---- */
  (function(){
    if (document.getElementById('visorEstilos')) return;
    const st = document.createElement('style');
    st.id = 'visorEstilos';
    st.textContent =
      '.visor-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;}' +
      '.visor-overlay img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;background:#fff;}' +
      '.visor-cerrar{position:absolute;top:14px;right:18px;background:#fff;color:#000;border:0;border-radius:999px;width:40px;height:40px;font-size:20px;cursor:pointer;}' +
      '.entrega-card .preview-item img{cursor:zoom-in;}' +
      '.entrega-badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:#FDE9A8;color:#5a4500;}' +
      '.entrega-badge.ok{background:#CDEBD9;color:#12362A;}' +
      '.entregas-resumen{font-size:14px;color:#3B4A41;margin:6px 0 0;}';
    document.head.appendChild(st);
  })();

  function abrirVisor(src){
    const ov = document.createElement('div');
    ov.className = 'visor-overlay';
    const img = document.createElement('img');
    img.src = src;
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'visor-cerrar'; x.textContent = '✕';
    const cerrar = ()=>{ ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e)=>{ if (e.key === 'Escape') cerrar(); };
    ov.addEventListener('click', cerrar);
    document.addEventListener('keydown', onKey);
    ov.appendChild(img); ov.appendChild(x);
    document.body.appendChild(ov);
  }

  // Descarga la imagen (los navegadores bloquean abrir data: URLs en pestaña nueva)
  function descargarEvidencia(url, nombre){
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre || 'evidencia.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function crearEntregaCard(docId, data){
    const card = document.createElement('div');
    card.className = 'entrega-card' + (data.calificado ? ' is-graded' : '');

    const head = document.createElement('div');
    head.className = 'entrega-head';
    let fecha = '';
    if (data.fecha && typeof data.fecha.toDate === 'function') {
      fecha = data.fecha.toDate().toLocaleString('es-CO');
    }
    const cedulaSpan = document.createElement('strong');
    cedulaSpan.textContent = 'Cédula: ' + data.cedula;
    const fechaSpan = document.createElement('span');
    fechaSpan.className = 'entrega-fecha';
    fechaSpan.textContent = fecha;
    const badge = document.createElement('span');
    badge.className = 'entrega-badge' + (data.calificado ? ' ok' : '');
    badge.textContent = data.calificado ? ('Calificado: ' + data.nota) : 'Pendiente por calificar';
    head.appendChild(cedulaSpan);
    head.appendChild(badge);
    head.appendChild(fechaSpan);
    card.appendChild(head);

    // Nombre del aprendiz, si está registrado en 'cedulas'
    db.collection('cedulas').doc(String(data.cedula)).get().then(cd=>{
      if (cd.exists && cd.data().nombre) {
        const nameEl = document.createElement('div');
        nameEl.className = 'entrega-nombre';
        nameEl.textContent = cd.data().nombre;
        head.appendChild(nameEl);
      }
    }).catch(()=>{});

    const grid = document.createElement('div');
    grid.className = 'preview-grid';
    (data.archivos || []).forEach(f=>{
      const item = document.createElement('div');
      item.className = 'preview-item';
      if ((f.tipo || '').startsWith('image/')) {
        const img = document.createElement('img');
        img.src = f.url;
        img.alt = f.nombre || 'Evidencia';
        img.title = 'Clic para ver en grande';
        img.addEventListener('click', ()=> abrirVisor(f.url));
        item.appendChild(img);
      } else {
        item.classList.add('preview-file');
        item.textContent = f.nombre || 'Archivo';
      }
      const dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'download-chip';
      dl.style.border = '0';
      dl.style.cursor = 'pointer';
      dl.textContent = '⬇';
      dl.title = 'Descargar ' + (f.nombre || 'archivo');
      dl.addEventListener('click', ()=> descargarEvidencia(f.url, f.nombre));
      item.appendChild(dl);
      grid.appendChild(item);
    });
    card.appendChild(grid);
    card.appendChild(form);
    card.appendChild(msg);

    /* ---- Botón: eliminar toda la entrega ---- */
    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'btn-eliminar-entrega';
    btnEliminar.textContent = '🗑 Eliminar entrega completa';
    btnEliminar.addEventListener('click', async ()=>{
      const ok = confirm('¿Eliminar TODA la entrega de la cédula ' + data.cedula +
        '?\nSe borrarán las imágenes y la nota. Esta acción no se puede deshacer.');
      if (!ok) return;
      btnEliminar.disabled = true;
      btnEliminar.textContent = 'Eliminando...';
      try{
        await db.collection('entregas').doc(docId).delete();
        // No hay que quitar la tarjeta a mano: onSnapshot de renderEntregas() la redibuja solo.
      } catch(err){
        msg.textContent = 'Error (' + err.code + '): ' + err.message;
        msg.className = 'form-msg error';
        btnEliminar.disabled = false;
        btnEliminar.textContent = '🗑 Eliminar entrega completa';
      }
    });
    card.appendChild(btnEliminar);

    return card;
  }
    const form = document.createElement('form');
    form.className = 'login-form entrega-grade-form';
    const notaInput = document.createElement('input');
    notaInput.type = 'text';
    notaInput.className = 'notaInput';
    notaInput.placeholder = 'Nota (ej: 4.5)';
    notaInput.value = (data.nota != null) ? data.nota : '';
    const comentarioInput = document.createElement('textarea');
    comentarioInput.className = 'comentarioInput';
    comentarioInput.rows = 2;
    comentarioInput.placeholder = 'Comentario para el aprendiz (opcional)';
    comentarioInput.value = data.comentario || '';
    const btnGuardar = document.createElement('button');
    btnGuardar.type = 'submit';
    btnGuardar.className = 'btn-login';
    btnGuardar.textContent = data.calificado ? 'Actualizar calificación' : 'Guardar calificación';
    form.appendChild(notaInput);
    form.appendChild(comentarioInput);
    form.appendChild(btnGuardar);

    const msg = document.createElement('p');
    msg.className = 'form-msg';

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const nota = notaInput.value.trim();
      const comentario = comentarioInput.value.trim();
      if (!nota) { msg.textContent = 'Escribe una nota antes de guardar.'; msg.className = 'form-msg error'; return; }
      msg.textContent = 'Guardando...'; msg.className = 'form-msg';
      try{
        await db.collection('entregas').doc(docId).update({
          nota: nota,
          comentario: comentario || null,
          calificado: true,
          fechaCalificacion: firebase.firestore.FieldValue.serverTimestamp()
        });
        msg.textContent = 'Calificación guardada. El aprendiz ya puede verla.'; msg.className = 'form-msg ok';
        btnGuardar.textContent = 'Actualizar calificación';
        card.classList.add('is-graded');
      } catch(err){
        msg.textContent = 'Error (' + err.code + '): ' + err.message; msg.className = 'form-msg error';
      }
    });

    card.appendChild(form);
    card.appendChild(msg);
    return card;
  }

  function renderEntregas(){
    if (!entregaSelector || !listaEntregas) return;
    const id = entregaSelector.value;
    listaEntregas.innerHTML = '<p class="m-desc">Cargando entregas...</p>';
    if (unsubEntregas) unsubEntregas();
    unsubEntregas = db.collection('entregas').where('actividadId','==', id)
      .onSnapshot(snapshot=>{
        listaEntregas.innerHTML = '';
        if (snapshot.empty) {
          listaEntregas.innerHTML = '<p class="m-desc">Todavía no hay entregas de los aprendices para este módulo.</p>';
          return;
        }
        const docs = snapshot.docs.slice().sort((x,y)=>{
          const fx = x.data().fecha && x.data().fecha.toMillis ? x.data().fecha.toMillis() : 0;
          const fy = y.data().fecha && y.data().fecha.toMillis ? y.data().fecha.toMillis() : 0;
          return fy - fx; // más recientes primero
        });
        const pendientes = docs.filter(d=>!d.data().calificado).length;
        const resumen = document.createElement('p');
        resumen.className = 'entregas-resumen';
        resumen.textContent = docs.length + ' entrega(s) · ' + pendientes + ' pendiente(s) por calificar';
        listaEntregas.appendChild(resumen);
        docs.forEach(doc=>{
          listaEntregas.appendChild(crearEntregaCard(doc.id, doc.data()));
        });
      }, err=>{
        listaEntregas.innerHTML = '<p class="form-msg error">Error al cargar entregas: ' + err.message + '</p>';
      });
  }

  if (entregaSelector) {
    entregaSelector.addEventListener('change', renderEntregas);
  }

})();

/* este es el carrusel*/
(function () {
  var slider = document.getElementById('testimonialSlider');
  if (!slider) return;
  var slides = slider.querySelectorAll('.testimonial-slide');
  var dots = slider.querySelectorAll('.t-dot');
  var current = 0, timer = null, INTERVAL = 15000;

  function show(n) {
    current = (n + slides.length) % slides.length;
    slides.forEach(function (s, i) {
      var on = i === current;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    dots.forEach(function (d, i) { d.classList.toggle('active', i === current); });
  }
  function start() { stop(); timer = setInterval(function () { show(current + 1); }, INTERVAL); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  dots.forEach(function (d, i) {
    d.addEventListener('click', function () { show(i); start(); });
  });
  slider.addEventListener('mouseenter', stop);
  slider.addEventListener('mouseleave', start);
  start();
})();
