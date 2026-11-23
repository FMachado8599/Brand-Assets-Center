"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List, ListOrdered, Loader2, Paperclip, Quote, Send, Underline as UnderlineIcon, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { api, separarMails, type Borrador } from "@/lib/correo/cliente";
import { formatoTamano, MAX_ADJUNTOS_BYTES, nombreDireccion, type DatosEnvio } from "@/lib/correo/types";
import { cn } from "@/lib/utils";

const TITULOS: Record<Borrador["modo"], string> = {
  nuevo: "Mail nuevo",
  responder: "Responder",
  responder_todos: "Responder a todos",
  reenviar: "Reenviar",
};

/** Escribir un mail: nuevo, respuesta o reenvío. El original se cita solo (lo arma el servidor). */
export function Redactar({ borrador, onClose, onEnviado }: { borrador: Borrador | null; onClose: () => void; onEnviado: () => void }) {
  const confirm = useConfirm();
  const [para, setPara] = useState("");
  const [cc, setCc] = useState("");
  const [cco, setCco] = useState("");
  const [conCc, setConCc] = useState(false);
  const [asunto, setAsunto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [tocado, setTocado] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const paraRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: false, code: false, codeBlock: false }), Underline, Placeholder.configure({ placeholder: "Escribí tu mail…" })],
    editorProps: { attributes: { class: "rich min-h-[12rem] px-4 py-3 text-[15px] leading-relaxed outline-none focus-visible:ring-0 focus-visible:ring-offset-0" } },
    onUpdate: () => setTocado(true),
  });

  // Cada vez que se abre, arranca con lo que trae el borrador.
  useEffect(() => {
    if (!borrador) return;
    setPara(borrador.para);
    setCc(borrador.cc);
    setCco("");
    setConCc(Boolean(borrador.cc));
    setAsunto(borrador.asunto);
    setArchivos([]);
    setTocado(false);
    editor?.commands.setContent("");
    // Al responder ya está a quién: el foco va al texto. En uno nuevo, al Para.
    setTimeout(() => (borrador.para ? editor?.commands.focus("start") : paraRef.current?.focus()), 60);
  }, [borrador, editor]);

  const total = archivos.reduce((s, f) => s + f.size, 0);
  const pasado = total > MAX_ADJUNTOS_BYTES;

  async function cerrar() {
    if (enviando) return;
    const algo = tocado || archivos.length > 0;
    if (algo && !(await confirm({ title: "¿Descartar el mail?", description: "Lo que escribiste no se guarda.", confirmLabel: "Descartar", destructive: true }))) return;
    onClose();
  }

  async function enviar() {
    if (!borrador || !editor) return;
    const datos: DatosEnvio = {
      para: separarMails(para),
      cc: separarMails(cc),
      cco: separarMails(cco),
      asunto: asunto.trim(),
      html: editor.isEmpty ? "" : editor.getHTML(),
      texto: editor.getText({ blockSeparator: "\n" }),
      modo: borrador.modo,
      original: borrador.original ? { carpeta: borrador.original.carpeta, uid: borrador.original.uid } : undefined,
    };
    if (!datos.para.length && !datos.cc.length && !datos.cco.length) {
      toast("Falta a quién mandarlo", "error");
      paraRef.current?.focus();
      return;
    }
    if (!datos.asunto && !(await confirm({ title: "¿Mandarlo sin asunto?", confirmLabel: "Mandar igual" }))) return;
    if (pasado) {
      toast(`Los adjuntos pasan los ${formatoTamano(MAX_ADJUNTOS_BYTES)}: sacá alguno o mandalo por el Drive`, "error");
      return;
    }
    const form = new FormData();
    form.set("datos", JSON.stringify(datos));
    archivos.forEach((f) => form.append("adjuntos", f, f.name));
    setEnviando(true);
    try {
      const r = await api<{ guardado: boolean }>("/api/correo/enviar", { method: "POST", body: form });
      toast(r.guardado ? "Mail enviado" : "Mail enviado (no se pudo guardar la copia en Enviados)");
      onEnviado();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const original = borrador?.original?.mensaje;

  return (
    <Dialog open={Boolean(borrador)} onOpenChange={(open) => !open && cerrar()}>
      <DialogContent
        className="max-w-3xl gap-0 p-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-screen max-sm:rounded-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            enviar();
          }
        }}
      >
        <div className="border-b px-5 pb-3 pt-4 pr-12">
          <DialogTitle className="text-xl">{borrador ? TITULOS[borrador.modo] : ""}</DialogTitle>
          <DialogDescription className="sr-only">Escribí el mail y mandalo desde tu casilla.</DialogDescription>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Campo label="Para">
            <input ref={paraRef} value={para} onChange={(e) => (setPara(e.target.value), setTocado(true))} placeholder="nombre@cliente.com, otra@…" className={CAMPO} />
            {!conCc && (
              <button type="button" onClick={() => setConCc(true)} className="shrink-0 px-2 text-[13px] text-muted-foreground hover:text-foreground">
                CC/CCO
              </button>
            )}
          </Campo>
          {conCc && (
            <>
              <Campo label="CC">
                <input value={cc} onChange={(e) => setCc(e.target.value)} className={CAMPO} />
              </Campo>
              <Campo label="CCO">
                <input value={cco} onChange={(e) => setCco(e.target.value)} placeholder="Nadie ve a quién va en copia oculta" className={CAMPO} />
              </Campo>
            </>
          )}
          <Campo label="Asunto">
            <input value={asunto} onChange={(e) => (setAsunto(e.target.value), setTocado(true))} className={cn(CAMPO, "font-medium")} />
          </Campo>

          <Barra editor={editor} onAdjuntar={() => input.current?.click()} />
          <EditorContent editor={editor} className="flex-1" />

          {original && (
            <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-[13px] text-muted-foreground">
              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">
                {borrador?.modo === "reenviar" ? "Va el mail original abajo, con sus adjuntos" : "Va citado abajo el mail de"}{" "}
                {borrador?.modo !== "reenviar" && <b className="font-medium text-foreground">{original.de[0] ? nombreDireccion(original.de[0]) : "—"}</b>}
                {borrador?.modo === "reenviar" && original.listaAdjuntos.some((a) => !a.inline) && (
                  <> ({original.listaAdjuntos.filter((a) => !a.inline).length})</>
                )}
                .
              </span>
            </div>
          )}

          {archivos.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {archivos.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card py-1 pl-3 pr-1 text-[13px]">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatoTamano(f.size)}</span>
                  <button
                    type="button"
                    aria-label={`Sacar ${f.name}`}
                    onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))}
                    className="grid h-6 w-6 place-items-center rounded-full hover:bg-accent"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {pasado && <p className="w-full text-[13px] text-destructive">Pasan los {formatoTamano(MAX_ADJUNTOS_BYTES)}: lo pesado mandalo por el Drive.</p>}
            </div>
          )}
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const nuevos = Array.from(e.target.files ?? []);
              setArchivos((a) => [...a, ...nuevos]);
              setTocado(true);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter para mandar</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={cerrar} disabled={enviando}>
              Descartar
            </Button>
            <Button onClick={enviar} disabled={enviando}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              {enviando ? "Mandando…" : "Mandar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CAMPO = "h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-3 border-b px-4">
      <span className="w-14 shrink-0 text-[13px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Barra({ editor, onAdjuntar }: { editor: Editor | null; onAdjuntar: () => void }) {
  const boton = (label: string, Icon: LucideIcon, activo: boolean, accion: () => void) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={activo}
      onMouseDown={(e) => e.preventDefault()}
      onClick={accion}
      className={cn("grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", activo && "bg-accent text-foreground")}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
  const c = () => editor?.chain().focus();
  return (
    <div className="flex items-center gap-0.5 border-b px-3 py-1.5">
      {boton("Negrita", Bold, Boolean(editor?.isActive("bold")), () => c()?.toggleBold().run())}
      {boton("Cursiva", Italic, Boolean(editor?.isActive("italic")), () => c()?.toggleItalic().run())}
      {boton("Subrayado", UnderlineIcon, Boolean(editor?.isActive("underline")), () => c()?.toggleUnderline().run())}
      <span className="mx-1 h-5 w-px bg-border" />
      {boton("Lista", List, Boolean(editor?.isActive("bulletList")), () => c()?.toggleBulletList().run())}
      {boton("Lista numerada", ListOrdered, Boolean(editor?.isActive("orderedList")), () => c()?.toggleOrderedList().run())}
      <span className="mx-1 h-5 w-px bg-border" />
      {boton("Adjuntar archivos", Paperclip, false, onAdjuntar)}
    </div>
  );
}
