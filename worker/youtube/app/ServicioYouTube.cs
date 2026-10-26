// Servicio de YouTube de Herramientas: la app de la bandeja (junto al reloj) que mantiene corriendo server.mjs.
// Lo abre sin ventana, lo vuelve a abrir si se cae, muestra el estado con el color del ícono y arranca con Windows.
// Se compila con compilar.cmd, con el compilador de C# que ya trae Windows (C# 5: sin ?., $"" ni nameof).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Herramientas - Servicio de YouTube")]
[assembly: AssemblyDescription("Baja los videos de YouTube para Herramientas (Descargas)")]
[assembly: AssemblyCompany("Cámara TBWA")]
[assembly: AssemblyProduct("Herramientas")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace Herramientas
{
    enum Estado { Arrancando, Funcionando, Aviso, Error, Detenido }

    /// <summary>Un pedido de alguien de la app: quién, desde dónde, qué video y cómo terminó.</summary>
    sealed class Pedido
    {
        public DateTime Hora;
        public string Job, Quien, Email, Desde, Titulo, Que, Resultado;
        public bool Terminado, Fallo;
    }

    static class Programa
    {
        public const string Titulo = "Servicio de YouTube";
        /// <summary>
        /// SERVICIO_PRUEBA=1: una segunda copia para probar cambios sin tocar la que está andando (otro nombre,
        /// otro registro, y no se anota para arrancar con Windows). Va con otro PORT y TMP_DIR.
        /// </summary>
        public static readonly bool Prueba = Environment.GetEnvironmentVariable("SERVICIO_PRUEBA") == "1";
        static readonly string Nombre = "Local\\Herramientas.ServicioYouTube" + (Prueba ? ".Prueba" : "");
        public static readonly string PedidoMostrar = Nombre + ".Mostrar";
        static readonly string UnaSolaVez = Nombre;

        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main(string[] args)
        {
            bool primero;
            using (var mutex = new Mutex(true, UnaSolaVez, out primero))
            {
                if (!primero)
                {
                    // Ya está abierto: abrirlo de nuevo muestra su ventana.
                    try { using (var e = EventWaitHandle.OpenExisting(PedidoMostrar)) e.Set(); }
                    catch (WaitHandleCannotBeOpenedException) { }
                    return;
                }
                try { SetProcessDPIAware(); } catch { }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                // Con Windows arranca con --inicio: callado, solo el ícono. Abierto a mano, muestra la ventana.
                Application.Run(new Bandeja(Array.IndexOf(args, "--inicio") >= 0));
                GC.KeepAlive(mutex);
            }
        }
    }

    sealed class Bandeja : ApplicationContext
    {
        const string ClaveInicio = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string ClaveAprobado = @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
        const string ClaveAjustes = @"Software\Herramientas\ServicioYouTube";
        const string NombreInicio = "Herramientas - Servicio de YouTube";

        readonly string carpeta = Path.GetDirectoryName(Application.ExecutablePath);
        readonly Control ui = new Control();
        readonly NotifyIcon icono = new NotifyIcon();
        readonly ContextMenuStrip menu = new ContextMenuStrip();
        readonly ToolStripMenuItem itemEstado, itemCopiar, itemInicio;
        readonly Dictionary<Estado, Icon> iconos = new Dictionary<Estado, Icon>();
        readonly System.Windows.Forms.Timer reintento = new System.Windows.Forms.Timer();
        readonly EventWaitHandle pedidoMostrar;
        readonly IntPtr trabajo;
        readonly object candado = new object();
        readonly List<string> lineas = new List<string>();
        // Los últimos pedidos, desde que se abrió la app (el historial completo está en la página de métricas).
        readonly List<Pedido> pedidos = new List<Pedido>();
        readonly JavaScriptSerializer json = new JavaScriptSerializer();
        StreamWriter archivo;

        Process proceso;
        DateTime arranque;
        int caidas, bajando;
        bool noReintentar, algunaVezEscucho, saliendo, huboError;
        Estado estado = Estado.Detenido;
        string titulo = "", detalle = "", direccion;
        VentanaRegistro ventana;

        public Bandeja(bool callado)
        {
            IntPtr handle = ui.Handle; // para poder pasarle cosas al hilo de la ventana desde otros hilos
            trabajo = Trabajo.Crear();
            AbrirArchivo();

            int tam = SystemInformation.SmallIconSize.Width;
            foreach (Estado e in Enum.GetValues(typeof(Estado))) iconos[e] = Dibujo.Icono(tam, Dibujo.ColorDe(e));

            menu.Font = new Font("Segoe UI", 9F);
            itemEstado = new ToolStripMenuItem("Arrancando…", null, delegate { Mostrar(); });
            itemEstado.Font = new Font(menu.Font, FontStyle.Bold);
            var itemVer = new ToolStripMenuItem("Ver estado y registro…", null, delegate { Mostrar(); });
            itemCopiar = new ToolStripMenuItem("Copiar dirección pública", null, delegate { CopiarDireccion(true); });
            itemCopiar.Enabled = false;
            var itemReiniciar = new ToolStripMenuItem("Reiniciar el servicio", null, delegate { Reiniciar(); });
            itemInicio = new ToolStripMenuItem("Arrancar con Windows", null, delegate { CambiarInicio(); });
            var itemSalir = new ToolStripMenuItem("Salir", null, delegate { Salir(); });
            menu.Items.AddRange(new ToolStripItem[] {
                itemEstado, new ToolStripSeparator(),
                itemVer, itemCopiar, itemReiniciar, new ToolStripSeparator(),
                itemInicio, new ToolStripSeparator(),
                itemSalir });
            menu.Opening += delegate { itemInicio.Checked = ArrancaConWindows(); };

            icono.ContextMenuStrip = menu;
            icono.Icon = iconos[Estado.Arrancando];
            icono.Text = Programa.Titulo;
            icono.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) Mostrar(); };
            icono.Visible = true;

            reintento.Tick += delegate { reintento.Stop(); Arrancar(); };

            pedidoMostrar = new EventWaitHandle(false, EventResetMode.AutoReset, Programa.PedidoMostrar);
            ThreadPool.RegisterWaitForSingleObject(pedidoMostrar, delegate { ui.BeginInvoke((Action)Mostrar); }, null, -1, false);

            PrimeraVez();
            Arrancar();
            if (!callado) Mostrar();
        }

        /* ───────────── El proceso ───────────── */

        void Arrancar()
        {
            if (saliendo || proceso != null) return;
            direccion = null;
            bajando = 0;
            // Lo que estaba bajando cuando se cerró el servicio ya no va a terminar.
            foreach (var pedido in pedidos)
            {
                if (pedido.Terminado) continue;
                pedido.Terminado = true;
                pedido.Fallo = true;
                pedido.Resultado = "Se cortó (se reinició el servicio)";
            }
            string node = BuscarNode();
            if (node == null)
            {
                Fijar(Estado.Error, "No encuentro Node.js", "Instalá Node 20 o más nuevo (nodejs.org) y tocá Reiniciar.");
                return;
            }
            if (!File.Exists(Path.Combine(carpeta, "server.mjs")))
            {
                Fijar(Estado.Error, "Falta server.mjs", "El programa tiene que estar en la carpeta worker\\youtube, al lado de server.mjs.");
                return;
            }

            var info = new ProcessStartInfo(node, "server.mjs");
            info.WorkingDirectory = carpeta;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.StandardOutputEncoding = Encoding.UTF8;
            info.StandardErrorEncoding = Encoding.UTF8;
            // Con esto el servicio manda una línea "@@{...}" por pedido, para la pestaña Descargas.
            info.EnvironmentVariables["SERVICIO_APP"] = "1";

            var p = new Process();
            p.StartInfo = info;
            p.EnableRaisingEvents = true;
            p.OutputDataReceived += (s, e) => Leer(e.Data);
            p.ErrorDataReceived += (s, e) => Leer(e.Data);
            p.Exited += delegate { ui.BeginInvoke((Action)(() => Termino(p))); };

            Fijar(Estado.Arrancando, "Arrancando…", "Abriendo el servicio y el túnel.");
            try
            {
                p.Start();
            }
            catch (Exception ex)
            {
                Fijar(Estado.Error, "No pude abrir el servicio", ex.Message);
                return;
            }
            // En el mismo "trabajo" que esta app: si la app se cierra (o se cuelga), se cierran Node, el túnel y yt-dlp.
            Trabajo.Sumar(trabajo, p);
            proceso = p;
            arranque = DateTime.Now;
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
        }

        void Termino(Process p)
        {
            if (p != proceso) return; // lo cerró esta app (Reiniciar o Salir)
            proceso = null;
            int codigo = -1;
            try { codigo = p.ExitCode; } catch { }
            // Lo que haya quedado abierto (el túnel) se cierra con él.
            Trabajo.Cerrar(trabajo);
            bool corto = (DateTime.Now - arranque).TotalSeconds < 60;
            // Se espera un poco: las últimas líneas (que suelen explicar por qué se cerró) llegan después.
            var espera = new System.Windows.Forms.Timer();
            espera.Interval = 800;
            espera.Tick += delegate { espera.Stop(); espera.Dispose(); Decidir(codigo, corto); };
            espera.Start();
        }

        void Decidir(int codigo, bool corto)
        {
            if (saliendo || proceso != null) return;
            if (noReintentar) return; // la línea que explica el problema ya dejó el estado
            caidas = corto ? caidas + 1 : 1;
            if (caidas >= 4)
            {
                Fijar(Estado.Error, "Se cierra solo al arrancar", "Mirá el registro para ver qué pasa y tocá Reiniciar.");
                return;
            }
            Fijar(Estado.Error, "Se cerró: lo vuelvo a abrir", "Salió con código " + codigo + ". Lo reabro en 10 segundos.");
            reintento.Interval = 10000;
            reintento.Start();
        }

        void Detener()
        {
            reintento.Stop();
            var p = proceso;
            proceso = null;
            Trabajo.Cerrar(trabajo);
            if (p != null) { try { p.WaitForExit(3000); } catch { } }
        }

        void Reiniciar()
        {
            noReintentar = false;
            caidas = 0;
            Registrar("Reinicio el servicio.");
            Detener();
            Fijar(Estado.Arrancando, "Reiniciando…", "");
            // Un momento para que Windows libere el puerto.
            var espera = new System.Windows.Forms.Timer();
            espera.Interval = 1500;
            espera.Tick += delegate { espera.Stop(); espera.Dispose(); Arrancar(); };
            espera.Start();
        }

        void Salir()
        {
            string cuando = ArrancaConWindows() ? " (o hasta la próxima vez que prendas la PC)" : "";
            var r = MessageBox.Show(
                "Si lo cerrás, Herramientas no va a poder bajar videos de YouTube hasta que lo vuelvas a abrir" + cuando + ".\n\n¿Cerrar el servicio?",
                Programa.Titulo, MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
            if (r != DialogResult.Yes) return;
            saliendo = true;
            Registrar("Cerré el servicio.");
            Detener();
            ExitThread();
        }

        protected override void ExitThreadCore()
        {
            saliendo = true;
            Trabajo.Cerrar(trabajo);
            icono.Visible = false;
            icono.Dispose();
            if (ventana != null && !ventana.IsDisposed) ventana.Dispose();
            lock (candado) { if (archivo != null) { archivo.Dispose(); archivo = null; } }
            base.ExitThreadCore();
        }

        /* ───────────── Lo que dice el servicio ───────────── */

        // Llega desde otro hilo: se guarda en el registro y se interpreta en el de la ventana.
        void Leer(string linea)
        {
            if (linea == null) return;
            if (linea.StartsWith("@@"))
            {
                // Un pedido o su resultado: va a la pestaña Descargas (el registro ya tiene su línea legible).
                string datos = linea.Substring(2);
                try { ui.BeginInvoke((Action)(() => Evento(datos))); } catch (InvalidOperationException) { }
                return;
            }
            Escribir(linea);
            try { ui.BeginInvoke((Action)(() => Interpretar(linea))); } catch (InvalidOperationException) { }
        }

        void Evento(string datos)
        {
            Dictionary<string, object> e;
            try { e = json.Deserialize<Dictionary<string, object>>(datos); }
            catch { return; }
            if (e == null) return;
            string tipo = Texto(e, "tipo"), job = Texto(e, "job");
            if (tipo == "pedido")
            {
                var p = new Pedido();
                p.Hora = DateTime.Now;
                p.Job = job;
                p.Email = Texto(e, "email");
                p.Quien = Texto(e, "quien") ?? p.Email ?? "Sin identificar";
                p.Desde = Desde(Texto(e, "desde"));
                p.Titulo = Texto(e, "titulo") ?? Texto(e, "video") ?? "";
                p.Que = Que(Texto(e, "modo"), Numero(e, "calidad"));
                string estado = Texto(e, "estado");
                if (estado == "done")
                {
                    p.Terminado = true;
                    p.Resultado = "Ya estaba listo" + Peso(Numero(e, "bytes"));
                }
                else p.Resultado = estado == "queued" ? "En espera" : "Bajando…";
                pedidos.Insert(0, p);
                if (pedidos.Count > 300) pedidos.RemoveAt(pedidos.Count - 1);
            }
            else if (tipo == "listo" || tipo == "error")
            {
                // Varias personas pueden haber pedido el mismo video: terminan todos juntos.
                foreach (var p in pedidos)
                {
                    if (p.Job != job || p.Terminado) continue;
                    p.Terminado = true;
                    p.Fallo = tipo == "error";
                    long? segundos = Numero(e, "segundos");
                    p.Resultado = tipo == "listo"
                        ? "Listo" + Peso(Numero(e, "bytes")) + (segundos.HasValue ? " en " + segundos + " s" : "")
                        : "No se pudo: " + (Texto(e, "error") ?? "error");
                }
            }
            else return;

            var activos = new HashSet<string>();
            foreach (var p in pedidos) if (!p.Terminado && p.Job != null) activos.Add(p.Job);
            bajando = activos.Count;
            ActualizarTexto();
            if (ventana != null && !ventana.IsDisposed) ventana.MostrarDescargas(pedidos, Resumen());
        }

        /// <summary>"Hoy: 5 pedidos de 3 personas · 4 desde la oficina".</summary>
        string Resumen()
        {
            int total = 0, oficina = 0;
            var personas = new HashSet<string>();
            foreach (var p in pedidos)
            {
                if (p.Hora.Date != DateTime.Today) continue;
                total++;
                if (p.Email != null) personas.Add(p.Email);
                if (p.Desde == "Oficina") oficina++;
            }
            if (pedidos.Count == 0) return "Todavía nadie pidió un video desde que se abrió el servicio. Acá aparece quién baja cada uno y desde dónde.";
            if (total == 0) return "Hoy todavía no hubo pedidos.";
            string quienes = personas.Count == 0 ? "" : " de " + personas.Count + (personas.Count == 1 ? " persona" : " personas");
            return "Hoy: " + total + (total == 1 ? " pedido" : " pedidos") + quienes + " · " + oficina + " desde la oficina";
        }

        static string Desde(string valor)
        {
            switch (valor)
            {
                case "oficina": return "Oficina";
                case "afuera": return "Afuera";
                case "local": return "Esta PC";
                default: return "¿?";
            }
        }

        static string Que(string modo, long? calidad)
        {
            if (modo == "audio") return "Solo audio";
            string q = calidad.HasValue ? calidad + "p" : "Video";
            return modo == "mute" ? q + " sin audio" : q;
        }

        static string Peso(long? bytes)
        {
            if (!bytes.HasValue || bytes.Value <= 0) return "";
            double mb = bytes.Value / 1e6;
            return " · " + (mb >= 1000 ? (mb / 1000).ToString("0.0") + " GB" : mb.ToString(mb >= 10 ? "0" : "0.0") + " MB");
        }

        static string Texto(Dictionary<string, object> e, string clave)
        {
            object v;
            return e.TryGetValue(clave, out v) && v is string && ((string)v).Length > 0 ? (string)v : null;
        }

        static long? Numero(Dictionary<string, object> e, string clave)
        {
            object v;
            if (!e.TryGetValue(clave, out v) || v == null) return null;
            try { return Convert.ToInt64(v); }
            catch { return null; }
        }

        void Interpretar(string l)
        {
            if (ventana != null && !ventana.IsDisposed) ventana.Agregar(l);
            Match m;
            if (l.Contains("Servicio de YouTube en http://localhost"))
            {
                algunaVezEscucho = true;
                Fijar(Estado.Arrancando, "Abriendo el túnel…", "El servicio ya corre en esta PC.");
            }
            else if ((m = Regex.Match(l, @"Dirección pública: (https?://\S+)")).Success)
            {
                direccion = m.Groups[1].Value;
                Fijar(Estado.Arrancando, "Avisándole a Vercel…", "Anotando la dirección pública para que la app la use.");
            }
            else if (l.Contains("Dirección anotada en Vercel"))
                Fijar(Estado.Funcionando, "Funcionando", "Herramientas ya puede bajar videos de YouTube.");
            else if (l.Contains("Falta BLOB_READ_WRITE_TOKEN"))
                Fijar(Estado.Error, "Falta el token del Blob", "Sin BLOB_READ_WRITE_TOKEN en .env, la app no se entera de la dirección (ver README).");
            else if (l.Contains("No pude anotar la dirección en Vercel"))
                Fijar(Estado.Error, "No puedo avisarle a Vercel", "Lo sigo intentando solo. Si no se arregla, revisá BLOB_READ_WRITE_TOKEN en .env.");
            else if (l.Contains("El túnel se cerró") || l.Contains("El túnel no respondió") || l.Contains("no responde hace rato"))
            {
                direccion = null;
                Fijar(Estado.Aviso, "Reconectando el túnel…", "Pasa después de un corte de internet. Se arregla solo.");
            }
            else if (l.Contains("No pude abrir el túnel"))
                Fijar(Estado.Error, "No pude abrir el túnel", "Falta bin\\cloudflared.exe o algo lo bloquea (ver el registro).");
            else if (l.Contains("Sin túnel ni PUBLIC_URL"))
                Fijar(Estado.Aviso, "Solo en esta PC", "Sin túnel ni PUBLIC_URL: la app en Vercel no lo alcanza.");
            else if (l.Contains("Falta YOUTUBE_WORKER_SECRET"))
            {
                noReintentar = true;
                Fijar(Estado.Error, "Falta la clave en .env", "Falta YOUTUBE_WORKER_SECRET (ver README).");
            }
            else if (l.Contains("EADDRINUSE"))
            {
                // Al abrir la app: lo más probable es otra copia (la ventana de iniciar.cmd). Después de una caída, se reintenta.
                if (!algunaVezEscucho)
                {
                    noReintentar = true;
                    Fijar(Estado.Error, "El puerto está ocupado", "¿Quedó abierta la ventana de iniciar.cmd? Cerrala y tocá Reiniciar.");
                }
            }
        }

        void Fijar(Estado e, string t, string d)
        {
            var antes = estado;
            bool cambio = e != estado || t != titulo;
            estado = e;
            titulo = t;
            detalle = d ?? "";
            icono.Icon = iconos[e];
            itemEstado.Text = t;
            itemCopiar.Enabled = direccion != null;
            ActualizarTexto();
            if (cambio) Registrar("Estado: " + t + (detalle.Length > 0 ? " (" + detalle + ")" : ""));
            if (e == Estado.Error && antes != Estado.Error)
                icono.ShowBalloonTip(10000, Programa.Titulo + ": " + t, detalle.Length > 0 ? detalle : "Tocá el ícono para ver el registro.", ToolTipIcon.Warning);
            else if (e == Estado.Funcionando && huboError)
                icono.ShowBalloonTip(5000, Programa.Titulo, "Volvió a funcionar.", ToolTipIcon.Info);
            if (e == Estado.Error) huboError = true;
            else if (e == Estado.Funcionando) huboError = false;
            if (ventana != null && !ventana.IsDisposed) ventana.MostrarEstado(e, titulo, detalle, direccion);
        }

        void ActualizarTexto()
        {
            string texto = "YouTube: " + titulo;
            if (estado == Estado.Funcionando && bajando > 0) texto += bajando == 1 ? " · bajando 1 video" : " · bajando " + bajando + " videos";
            // Windows no deja más de 63 caracteres en el texto del ícono.
            icono.Text = texto.Length > 63 ? texto.Substring(0, 62) + "…" : texto;
        }

        /* ───────────── Ventana ───────────── */

        void Mostrar()
        {
            if (saliendo) return;
            if (ventana == null || ventana.IsDisposed)
            {
                ventana = new VentanaRegistro(() => CopiarDireccion(false), AbrirCarpeta, Reiniciar);
                string[] copia;
                lock (candado) copia = lineas.ToArray();
                ventana.Cargar(copia);
                ventana.MostrarDescargas(pedidos, Resumen());
            }
            ventana.MostrarEstado(estado, titulo, detalle, direccion);
            ventana.Show();
            if (ventana.WindowState == FormWindowState.Minimized) ventana.WindowState = FormWindowState.Normal;
            ventana.Activate();
        }

        void CopiarDireccion(bool avisar)
        {
            if (direccion == null) return;
            try { Clipboard.SetText(direccion); } catch { return; }
            if (avisar) icono.ShowBalloonTip(2500, "Dirección copiada", direccion, ToolTipIcon.None);
        }

        void AbrirCarpeta()
        {
            try { Process.Start("explorer.exe", "\"" + carpeta + "\""); } catch { }
        }

        /* ───────────── Arrancar con Windows ───────────── */

        void PrimeraVez()
        {
            if (Programa.Prueba) return;
            using (var ajustes = Registry.CurrentUser.CreateSubKey(ClaveAjustes))
            {
                if (ajustes.GetValue("InicioConfigurado") == null)
                {
                    EscribirInicio(true);
                    ajustes.SetValue("InicioConfigurado", 1, RegistryValueKind.DWord);
                    Registrar("Quedó para arrancar con Windows.");
                    icono.ShowBalloonTip(8000, Programa.Titulo, "Listo: arranca solo con Windows. Está acá, junto al reloj: tocalo para ver cómo anda.", ToolTipIcon.Info);
                }
                else if (EstaEnInicio())
                {
                    EscribirInicio(true); // por si el programa cambió de carpeta
                }
            }
        }

        bool EstaEnInicio()
        {
            using (var k = Registry.CurrentUser.OpenSubKey(ClaveInicio))
                return k != null && k.GetValue(NombreInicio) != null;
        }

        bool ArrancaConWindows()
        {
            if (!EstaEnInicio()) return false;
            // El Administrador de tareas lo puede desactivar sin borrarlo (Aplicaciones de arranque).
            using (var k = Registry.CurrentUser.OpenSubKey(ClaveAprobado))
            {
                var v = k == null ? null : k.GetValue(NombreInicio) as byte[];
                return v == null || v.Length == 0 || (v[0] & 1) == 0;
            }
        }

        void EscribirInicio(bool si)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(ClaveInicio))
            {
                if (si) k.SetValue(NombreInicio, "\"" + Application.ExecutablePath + "\" --inicio");
                else k.DeleteValue(NombreInicio, false);
            }
            using (var k = Registry.CurrentUser.OpenSubKey(ClaveAprobado, true))
                if (k != null) k.DeleteValue(NombreInicio, false);
        }

        void CambiarInicio()
        {
            bool si = !ArrancaConWindows();
            EscribirInicio(si);
            Registrar(si ? "Va a arrancar con Windows." : "Ya no arranca con Windows.");
        }

        /* ───────────── Registro (servicio.log) ───────────── */

        void AbrirArchivo()
        {
            string ruta = Path.Combine(carpeta, Programa.Prueba ? "servicio.prueba.log" : "servicio.log");
            try
            {
                if (File.Exists(ruta) && new FileInfo(ruta).Length > 2 * 1024 * 1024)
                {
                    string anterior = Path.Combine(carpeta, "servicio.anterior.log");
                    if (File.Exists(anterior)) File.Delete(anterior);
                    File.Move(ruta, anterior);
                }
                var fs = new FileStream(ruta, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                archivo = new StreamWriter(fs, new UTF8Encoding(false));
                archivo.AutoFlush = true;
                archivo.WriteLine();
                archivo.WriteLine("──── " + DateTime.Now.ToString("dd/MM/yyyy HH:mm") + " · se abrió la app ────");
            }
            catch
            {
                archivo = null; // sin registro en disco funciona igual
            }
        }

        void Escribir(string linea)
        {
            lock (candado)
            {
                if (archivo != null) { try { archivo.WriteLine(linea); } catch { } }
                lineas.Add(linea);
                if (lineas.Count > 1500) lineas.RemoveRange(0, 500);
            }
        }

        void Registrar(string mensaje)
        {
            string linea = DateTime.Now.ToString("HH:mm:ss") + "  · " + mensaje;
            Escribir(linea);
            if (ventana != null && !ventana.IsDisposed) ventana.Agregar(linea);
        }

        static string BuscarNode()
        {
            string propio = Environment.GetEnvironmentVariable("NODE_EXE");
            if (!string.IsNullOrEmpty(propio) && File.Exists(propio)) return propio;
            foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
            {
                try
                {
                    string f = Path.Combine(dir.Trim().Trim('"'), "node.exe");
                    if (dir.Trim().Length > 0 && File.Exists(f)) return f;
                }
                catch (ArgumentException) { }
            }
            foreach (string raiz in new[] {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs") })
            {
                string f = Path.Combine(raiz, "nodejs\\node.exe");
                if (File.Exists(f)) return f;
            }
            return null;
        }
    }

    /* ───────────── La ventana de estado y registro ───────────── */

    sealed class VentanaRegistro : Form
    {
        readonly Label lblPunto = new Label(), lblEstado = new Label(), lblDetalle = new Label(), lblDireccion = new Label();
        readonly TextBox texto = new TextBox();
        readonly Button btnCopiar = new Button(), btnCarpeta = new Button(), btnReiniciar = new Button(), btnCerrar = new Button();
        readonly TabControl pestanas = new TabControl();
        readonly ListView lista = new ListView();
        readonly Label lblResumen = new Label();

        public VentanaRegistro(Action copiar, Action abrirCarpeta, Action reiniciar)
        {
            SuspendLayout();
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            Font = new Font("Segoe UI", 9F);
            Text = "Servicio de YouTube · Herramientas" + (Programa.Prueba ? " (prueba)" : "");
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(880, 540);
            MinimumSize = new Size(560, 360);
            ShowInTaskbar = true;

            var raiz = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Padding = new Padding(14) };
            raiz.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F)); // sin esto la columna crece con el contenido y corta los botones
            raiz.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            raiz.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            raiz.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            // Estado: un punto del mismo color que el ícono, y en palabras (el color solo no alcanza).
            var cabeza = new TableLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 3, Margin = new Padding(0, 0, 0, 10) };
            cabeza.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            cabeza.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            lblPunto.Text = "●";
            lblPunto.AutoSize = true;
            lblPunto.Font = new Font("Segoe UI", 14F);
            lblPunto.Margin = new Padding(0, 0, 6, 0);
            lblPunto.AccessibleRole = AccessibleRole.None;
            lblEstado.AutoSize = true;
            lblEstado.Font = new Font("Segoe UI Semibold", 13F);
            lblEstado.Margin = new Padding(0, 2, 0, 0);
            lblDetalle.AutoSize = true;
            lblDetalle.Margin = new Padding(0, 2, 0, 0);
            lblDireccion.AutoSize = true;
            lblDireccion.ForeColor = SystemColors.GrayText;
            lblDireccion.Margin = new Padding(0, 4, 0, 0);
            cabeza.Controls.Add(lblPunto, 0, 0);
            cabeza.Controls.Add(lblEstado, 1, 0);
            cabeza.Controls.Add(lblDetalle, 1, 1);
            cabeza.Controls.Add(lblDireccion, 1, 2);

            texto.Multiline = true;
            texto.ReadOnly = true;
            texto.ScrollBars = ScrollBars.Vertical;
            texto.WordWrap = true;
            texto.Dock = DockStyle.Fill;
            texto.Font = new Font("Consolas", 9.5F);
            texto.BackColor = SystemColors.Window;
            texto.AccessibleName = "Registro del servicio";

            // Descargas: quién pidió cada video, desde dónde y cómo terminó (lo más nuevo arriba).
            float escala;
            using (var g = CreateGraphics()) escala = g.DpiX / 96F;
            lista.View = View.Details;
            lista.FullRowSelect = true;
            lista.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            lista.ShowItemToolTips = true;
            lista.Dock = DockStyle.Fill;
            lista.AccessibleName = "Pedidos de videos";
            foreach (var c in new[] { new { t = "Hora", w = 52 }, new { t = "Quién", w = 150 }, new { t = "Desde", w = 70 },
                                      new { t = "Video", w = 260 }, new { t = "Qué", w = 100 }, new { t = "Cómo terminó", w = 180 } })
                lista.Columns.Add(c.t, (int)(c.w * escala));
            // La última columna ocupa lo que sobra (sin barra de scroll horizontal).
            lista.Resize += delegate
            {
                int resto = lista.ClientSize.Width;
                for (int i = 0; i < lista.Columns.Count - 1; i++) resto -= lista.Columns[i].Width;
                lista.Columns[lista.Columns.Count - 1].Width = Math.Max((int)(120 * escala), resto);
            };
            lblResumen.AutoSize = true;
            lblResumen.Dock = DockStyle.Fill;
            lblResumen.Margin = new Padding(2, 6, 2, 8);
            var notaDescargas = new Label
            {
                Text = "Se ven los pedidos desde que se abrió el servicio. El historial completo (YouTube, Instagram y Pinterest) está en Herramientas → Descargas → Métricas.",
                AutoSize = true,
                Dock = DockStyle.Fill,
                ForeColor = SystemColors.GrayText,
                Margin = new Padding(2, 8, 2, 2),
            };
            var panelDescargas = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Padding = new Padding(6) };
            panelDescargas.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            panelDescargas.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            panelDescargas.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            panelDescargas.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            panelDescargas.Controls.Add(lblResumen, 0, 0);
            panelDescargas.Controls.Add(lista, 0, 1);
            panelDescargas.Controls.Add(notaDescargas, 0, 2);

            var tabDescargas = new TabPage("Descargas") { UseVisualStyleBackColor = true };
            tabDescargas.Controls.Add(panelDescargas);
            var tabRegistro = new TabPage("Registro") { UseVisualStyleBackColor = true, Padding = new Padding(6) };
            tabRegistro.Controls.Add(texto);
            pestanas.TabPages.Add(tabDescargas);
            pestanas.TabPages.Add(tabRegistro);
            pestanas.Dock = DockStyle.Fill;
            pestanas.Padding = new Point(14, 5);
            // El registro va al final cuando se lo mira (mientras está oculto no puede scrollear).
            pestanas.SelectedIndexChanged += delegate { if (pestanas.SelectedTab == tabRegistro) AlFinal(); };

            var pie = new TableLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = new Padding(0, 10, 0, 0) };
            pie.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            pie.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            var nota = new Label
            {
                Text = "Cerrar esta ventana no apaga el servicio: sigue junto al reloj.",
                AutoSize = true,
                ForeColor = SystemColors.GrayText,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                Margin = new Padding(0, 0, 12, 0),
            };
            var botones = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Margin = new Padding(0) };
            Boton(btnCopiar, "Copiar dirección", delegate
            {
                copiar();
                btnCopiar.Text = "Copiada ✓";
                var t = new System.Windows.Forms.Timer { Interval = 1500 };
                t.Tick += delegate { t.Stop(); t.Dispose(); if (!btnCopiar.IsDisposed) btnCopiar.Text = "Copiar dirección"; };
                t.Start();
            });
            Boton(btnCarpeta, "Abrir carpeta", delegate { abrirCarpeta(); });
            Boton(btnReiniciar, "Reiniciar", delegate { reiniciar(); });
            Boton(btnCerrar, "Cerrar", delegate { Hide(); });
            botones.Controls.AddRange(new Control[] { btnCopiar, btnCarpeta, btnReiniciar, btnCerrar });
            pie.Controls.Add(nota, 0, 0);
            pie.Controls.Add(botones, 1, 0);

            raiz.Controls.Add(cabeza, 0, 0);
            raiz.Controls.Add(pestanas, 0, 1);
            raiz.Controls.Add(pie, 0, 2);
            Controls.Add(raiz);
            CancelButton = btnCerrar; // Esc la cierra
            ResumeLayout(false);
            PerformLayout();
        }

        static void Boton(Button b, string texto, EventHandler click)
        {
            b.Text = texto;
            b.AutoSize = true;
            b.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            b.Padding = new Padding(10, 3, 10, 3);
            b.Margin = new Padding(6, 0, 0, 0);
            b.Click += click;
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            btnCerrar.Focus();
            AlFinal();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // La X solo la esconde: el servicio sigue. Al salir de la app o apagar la PC, se cierra de verdad.
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
            base.OnFormClosing(e);
        }

        public void Cargar(string[] lineas)
        {
            texto.Text = lineas.Length == 0 ? "" : string.Join("\r\n", lineas) + "\r\n";
            AlFinal();
        }

        public void Agregar(string linea)
        {
            if (texto.TextLength > 400000) texto.Text = texto.Text.Substring(texto.TextLength - 200000);
            texto.AppendText(linea + "\r\n");
        }

        void AlFinal()
        {
            texto.SelectionStart = texto.TextLength;
            texto.SelectionLength = 0;
            texto.ScrollToCaret();
        }

        public void MostrarDescargas(List<Pedido> pedidos, string resumen)
        {
            lblResumen.Text = resumen;
            lista.BeginUpdate();
            lista.Items.Clear();
            foreach (var p in pedidos)
            {
                var item = new ListViewItem(new[] { p.Hora.ToString("HH:mm"), p.Quien, p.Desde, p.Titulo, p.Que, p.Resultado });
                item.ToolTipText = p.Titulo + (p.Email != null ? "\n" + p.Quien + " · " + p.Email : "") + "\n" + p.Hora.ToString("dd/MM HH:mm:ss");
                if (p.Fallo) item.ForeColor = Color.FromArgb(185, 28, 28);
                else if (!p.Terminado) item.ForeColor = SystemColors.GrayText;
                lista.Items.Add(item);
            }
            lista.EndUpdate();
        }

        public void MostrarEstado(Estado e, string titulo, string detalle, string direccion)
        {
            lblPunto.ForeColor = Dibujo.ColorDe(e);
            lblEstado.Text = titulo;
            lblDetalle.Text = detalle;
            lblDetalle.Visible = !string.IsNullOrEmpty(detalle);
            lblDireccion.Text = direccion == null ? "Todavía sin dirección pública." : "Dirección pública: " + direccion;
            btnCopiar.Enabled = direccion != null;
        }
    }

    /* ───────────── Ícono ───────────── */

    static class Dibujo
    {
        // Los de Herramientas: amarillo de marca y negro tinta.
        static readonly Color Amarillo = Color.FromArgb(255, 209, 0);
        static readonly Color Tinta = Color.FromArgb(11, 11, 14);

        public static Color ColorDe(Estado e)
        {
            switch (e)
            {
                case Estado.Funcionando: return Color.FromArgb(22, 163, 74);
                case Estado.Arrancando:
                case Estado.Aviso: return Color.FromArgb(234, 88, 12);
                case Estado.Error: return Color.FromArgb(220, 38, 38);
                default: return Color.FromArgb(113, 113, 122);
            }
        }

        /// <summary>El ícono de la bandeja: el de la app con un punto del color del estado.</summary>
        public static Icon Icono(int s, Color punto)
        {
            using (var bmp = new Bitmap(s, s, PixelFormat.Format32bppArgb))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.Clear(Color.Transparent);
                    float m = Math.Max(0.5f, s * 0.03f);
                    using (var fondo = Redondeado(new RectangleF(m, m, s - 2 * m, s - 2 * m), s * 0.22f))
                    using (var b = new SolidBrush(Amarillo))
                        g.FillPath(b, fondo);
                    // Triángulo de "play", un poco arriba a la izquierda para dejarle lugar al punto.
                    float h = s * 0.44f, w = h * 0.88f, cx = s * 0.42f, cy = s * 0.41f;
                    var tri = new[] {
                        new PointF(cx - w * 0.42f, cy - h / 2),
                        new PointF(cx - w * 0.42f, cy + h / 2),
                        new PointF(cx + w * 0.58f, cy) };
                    using (var b = new SolidBrush(Tinta)) g.FillPolygon(b, tri);
                    float d = s * 0.46f, borde = Math.Max(1.2f, s * 0.08f);
                    var r = new RectangleF(s - d, s - d, d, d);
                    using (var b = new SolidBrush(Tinta)) g.FillEllipse(b, r);
                    r.Inflate(-borde, -borde);
                    using (var b = new SolidBrush(punto)) g.FillEllipse(b, r);
                }
                return Icon.FromHandle(bmp.GetHicon());
            }
        }

        static GraphicsPath Redondeado(RectangleF r, float radio)
        {
            var p = new GraphicsPath();
            float d = radio * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }
    }

    /* ───────────── "Trabajo" de Windows: los procesos hijos se cierran con la app ───────────── */

    static class Trabajo
    {
        [StructLayout(LayoutKind.Sequential)]
        struct LimitesBasicos
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct ContadoresES
        {
            public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct LimitesExtendidos
        {
            public LimitesBasicos Basicos;
            public ContadoresES ES;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr CreateJobObject(IntPtr atributos, string nombre);
        [DllImport("kernel32.dll")]
        static extern bool SetInformationJobObject(IntPtr job, int clase, ref LimitesExtendidos info, uint largo);
        [DllImport("kernel32.dll")]
        static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proceso);
        [DllImport("kernel32.dll")]
        static extern bool TerminateJobObject(IntPtr job, uint codigo);

        const int InfoExtendida = 9;
        const uint CerrarConElTrabajo = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE

        public static IntPtr Crear()
        {
            IntPtr job = CreateJobObject(IntPtr.Zero, null);
            var info = new LimitesExtendidos();
            info.Basicos.LimitFlags = CerrarConElTrabajo;
            SetInformationJobObject(job, InfoExtendida, ref info, (uint)Marshal.SizeOf(typeof(LimitesExtendidos)));
            return job;
        }

        public static void Sumar(IntPtr job, Process p)
        {
            try { AssignProcessToJobObject(job, p.Handle); } catch { }
        }

        /// <summary>Cierra todo lo que corre en el trabajo (Node, el túnel, yt-dlp); el trabajo sigue sirviendo.</summary>
        public static void Cerrar(IntPtr job)
        {
            if (job != IntPtr.Zero) TerminateJobObject(job, 1);
        }
    }
}
