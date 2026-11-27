/**
 * Palabras del español de todos los días y del mundo de las redes, para que el texto predictivo
 * complete desde el primer momento, aunque el cliente todavía no tenga textos escritos. Están en
 * tres grupos, de más a menos comunes; lo que escribe el cliente siempre pesa más que esto.
 * Se puede ampliar sin tocar nada más: una palabra por hueco, con sus tildes.
 */

const frecuentes = `
para como pero esta este esto estas estos desde hasta entre sobre porque cuando donde también además ahora
aquí acá allá siempre nunca todavía mientras durante antes después luego entonces menos mucho mucha muchos
muchas poco poca pocos pocas todo toda todos todas cada otro otra otros otras mismo misma mismos nuestro
nuestra nuestros nuestras cualquier alguna algunos algunas ninguna ninguno tanto tanta solo sino aunque según
contra hacia bajo tras través junto bien mejor mejores peor primero primera último última próximo próxima
nuevo nueva nuevos nuevas grande grandes único única propio propia cierto cierta tipo forma parte lugar
tiempo momento momentos vez veces día días semana semanas mes meses año años hoy mañana ayer noche tarde
siempre quiero quieres querés queremos quiere quieren puedo puedes podés podemos puede pueden tengo tienes
tenés tenemos tiene tienen hacer hacemos hace hacen hacé vamos vamos voy vas hay había fue fueron será serán
somos estamos están estar estaba estoy estás ser sido sea sean cosas cosa gente vida mundo casa trabajo
gracias hola bienvenido bienvenida bienvenidos bienvenidas feliz felices felicidades
`;

const comunes = `
poder querer decir saber tener estar ver dar venir poner salir pasar quedar creer llevar dejar seguir encontrar
llamar pensar volver tomar conocer vivir sentir tratar mirar contar empezar esperar buscar existir entrar
trabajar escribir perder producir ocurrir entender pedir recibir recordar terminar permitir aparecer conseguir
comenzar servir sacar necesitar mantener resultar cambiar presentar crear abrir considerar ganar formar traer
aceptar realizar lograr explicar preguntar tocar reconocer estudiar alcanzar nacer dirigir correr utilizar
pagar ayudar gustar jugar escuchar cumplir ofrecer descubrir levantar intentar disfrutar compartir celebrar
invitar regalar sumar aprovechar viajar cuidar elegir probar recomendar imaginar soñar brindar animar unir
acompañar comprar vender entregar enviar reservar consultar participar inscribir inscribirte registrar
descargar conocer conocerlos conocerte contarte contarles mostrar mostrarte compartirte anotar avisar
sumate sumarte animate animarte descubrí descubrilo conocé conocelo probá probalo elegí elegilo mirá miralo
fijate vení vamos contanos escribinos seguinos etiquetá etiquetanos compartí compartilo guardá guardalo
aprovechá ahorrá pedí pedilo reservá consultá visitanos encontranos llamanos comentá participá viví sentí
pensá imaginá disfrutá celebrá regalá regalate cuidate cuidá nuestros nuestras tenemos creamos ofrecemos
seguimos buscamos esperamos presentamos celebramos compartimos invitamos trabajamos pensamos soñamos
llegó llegamos llegan llega llegar llegada empieza empezamos comienza comenzamos termina terminamos sigue
siguen seguimos vuelve vuelven volvemos vuelta regresa regresamos disponible disponibles gratis gratuito
gratuita imperdible imperdibles increíble increíbles único única especial especiales exclusivo exclusiva
exclusivos exclusivas ideal ideales perfecto perfecta perfectos perfectas mejor mejores favorito favorita
favoritos favoritas famoso famosa famosos populares popular clásico clásica clásicos clásicas moderno
moderna tradicional tradicionales natural naturales fresco fresca frescos frescas frío fría fríos frías
helado helada caliente calientes rico rica ricos ricas delicioso deliciosa deliciosos deliciosas sabroso
sabrosa sabor sabores bebida bebidas comida comidas cerveza cervezas mesa mesas amigos amigas familia
familias juntos juntas pareja parejas personas persona chicos chicas todos todas nadie alguien algo nada
tarde tardes noches mañanas verano invierno otoño primavera navidad fiesta fiestas festejo festejos
celebración celebraciones cumpleaños aniversario aniversarios regalo regalos sorpresa sorpresas
sorteo sorteos concurso concursos ganador ganadores ganadora ganadoras premio premios participantes
participante participación participá ganá ganar
lunes martes miércoles jueves viernes sábado sábados domingo domingos enero febrero marzo abril mayo junio
julio agosto septiembre octubre noviembre diciembre finde semana mensual anual diario diaria
`;

const marca = `
promoción promociones promo promos descuento descuentos oferta ofertas lanzamiento lanzamientos novedad
novedades colección colecciones temporada temporadas edición ediciones limitada limitadas limitado
limitados beneficio beneficios experiencia experiencias comunidad comunidades equipo equipos marca marcas
producto productos servicio servicios cliente clientes calidad diseño diseños estilo estilos tendencia
tendencias campaña campañas contenido contenidos comunicación comunicamos historia historias historial
publicación publicaciones posteo posteos comentario comentarios comentá comentarnos seguidores seguidoras
seguidor seguidora seguinos hashtag hashtags perfil perfiles enlace enlaces link links bio redes sociales
plataforma plataformas digital digitales online virtual presencial presenciales evento eventos entrada
entradas ticket tickets show shows espectáculo espectáculos música concierto conciertos festival festivales
escenario escenarios artista artistas banda bandas show fiesta
tienda tiendas local locales sucursal sucursales horario horarios abierto abierta abiertos abiertas cerrado
cerrada dirección ubicación ubicaciones envío envíos entrega entregas compra compras comprá comprar
carrito pedido pedidos reserva reservas stock unidades agotar agotado agotados válido válida válidos
válidas vigencia vigente condiciones términos bases legales consultá información detalles detalle
más información consultas consulta contacto contactanos escribinos mensaje mensajes directo directos
WhatsApp Instagram Facebook TikTok YouTube Twitter LinkedIn Spotify
sustentable sustentables sustentabilidad responsable responsables responsabilidad compromiso compromisos
innovación innovador innovadora innovadores tecnología tecnológico tecnológica inteligente inteligentes
saludable saludables bienestar energía energético fuerza pasión emoción emociones alegría felicidad magia
mágico mágica mágicos mágicas inolvidable inolvidables auténtico auténtica auténticos auténticas genuino
genuina original originales verdadero verdadera verdaderos verdaderas orgullo orgulloso orgullosa
orgullosos orgullosas inspiración inspirador inspiradora inspirar inspirados motivación motivar
actitud ambiente ambientes espacio espacios lugar lugares ciudad ciudades barrio barrios país países
Argentina argentino argentinos Buenos Aires Córdoba Rosario Mendoza Latinoamérica
sueño sueños idea ideas proyecto proyectos propuesta propuestas objetivo objetivos resultado resultados
éxito logro logros desafío desafíos oportunidad oportunidades futuro presente pasado tradición tradiciones
cultura culturas deporte deportes fútbol partido partidos equipo equipos campeón campeones campeona
campeonas copa copas torneo torneos hinchas hincha hinchada afición liga mundial mundiales
gracias agradecemos agradecimiento agradecidos agradecidas saludos abrazo abrazos saludo
`;

/** Cada palabra con su peso, siempre menor a 1: una sola vez que el cliente la escribió ya le gana. */
function armar() {
  const pesos = new Map<string, readonly [string, number]>();
  const grupos: [string, number][] = [
    [frecuentes, 0.9],
    [comunes, 0.5],
    [marca, 0.3],
  ];
  for (const [lista, peso] of grupos) {
    const palabras = [...new Set(lista.split(/\s+/).filter((w) => w.length >= 4))];
    palabras.forEach((w, i) => {
      // Dentro de cada grupo las primeras pesan un poco más; una palabra de un grupo anterior no se repite.
      if (!pesos.has(w.toLowerCase())) pesos.set(w.toLowerCase(), [w, peso * (1 - (i / palabras.length) * 0.5)]);
    });
  }
  return [...pesos.values()];
}

export const DICCIONARIO: ReadonlyArray<readonly [string, number]> = armar();
