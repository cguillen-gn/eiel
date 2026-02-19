#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# gen_forms.py
import os, json, sys, csv, shutil
from jinja2 import Environment, FileSystemLoader, select_autoescape
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras
import re
import base64
from io import BytesIO
from PIL import Image

load_dotenv()

# --- FUNCIÓN PARA FORMATEAR NOMBRES DE MUNICIPIOS ---
def formatear_nombre_ui(nombre_original):
    if not nombre_original: return ""
    
    def arreglar_fragmento(texto):
        texto = texto.strip()
        # Busca: "Texto (Articulo)" -> "Articulo Texto"
        patron = r"^(.*)\s\((El|La|Lo|Los|Las|Els|Les|Es|Sa|L')\)$"
        match = re.search(patron, texto, re.IGNORECASE)
        if match:
            nombre = match.group(1)
            articulo = match.group(2).capitalize()
            if articulo.lower().startswith("l'"): articulo = "L'"
            return f"{articulo} {nombre}"
        return texto

    partes = nombre_original.split('/')
    return " / ".join([arreglar_fragmento(p) for p in partes])

# --- CONSTANTES DE RUTAS ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, 'docs')
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
ASSETS_CSS_DIR = os.path.join(BASE_DIR, "css")
ASSETS_JS_DIR = os.path.join(BASE_DIR, "js") 


# --- ARCHIVO DE LISTADO DE MUNICIPIOS Y SUS CODIGOS INE ---
MUNICIPIOS_FILE = os.path.join(BASE_DIR, "data", "municipios.tsv")

# --- PLANTILLAS ---
TEMPLATE_INDEX = "index-template.html.j2" 
TEMPLATE_AGUA = "form-agua.html.j2"
TEMPLATE_OBRAS = "form-obras.html.j2"
TEMPLATE_RESIDUOS = "form-residuos.html.j2"
TEMPLATE_CEMENTERIOS = "form-cementerios.html.j2"
TEMPLATE_EQUIPAMIENTOS = "form-equipamientos.html.j2"
TEMPLATE_VIARIO = "form-viario.html.j2"
TEMPLATE_ALUMBRADO = "form-alumbrado.html.j2"
TEMPLATE_SANEAMIENTO = "form-saneamiento.html.j2"

# --- PARAMETROS DB ---
DB = {
    "host": os.getenv("DB_HOST"), 
    "port": os.getenv("DB_PORT"), 
    "dbname": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"), 
    "password": os.getenv("DB_PASSWORD")
}

# --- URLs APPS SCRIPT ---
URL_ADJUNTOS = os.getenv("URL_ADJUNTOS")
URL_GENERAR_PDF = os.getenv("URL_GENERAR_PDF")
URL_LOGIN_SCRIPT = os.getenv("URL_LOGIN_SCRIPT")
URL_LOGGER = os.getenv("URL_LOGGER")


# --- CARGA DE LISTA DE MUNICIPIOS (DESDE TSV) ---

MUNICIPIOS_LISTA_UI = [] # Para rellenar el combo del login

try:
    if os.path.exists(MUNICIPIOS_FILE):
        with open(MUNICIPIOS_FILE, "r", encoding="utf-8") as f:
            # Leemos el TSV con delimitador de tabulación
            reader = csv.reader(f, delimiter='\t')
            
            print(f"Cargando lista de municipios desde: {MUNICIPIOS_FILE}")
            for row in reader:
                # Aseguramos que la fila tenga al menos Código y Nombre
                if len(row) >= 2:
                    code = row[0].strip()
                    name = row[1].strip()
                    
                    # Saltar la cabecera si existe
                    if code.lower() in ["codigo", "code", "id", "cod_ine", "ine"]:
                        continue
                    
                    # Calculamos el nombre bonito al cargar (nombre con el artículo delante)
                    name_bonito = formatear_nombre_ui(name)

                    MUNICIPIOS_LISTA_UI.append({
                        "code": code, 
                        "name": name,              # Nombre original (para Login/Combo)
                        "name_bonito": name_bonito # Nombre bonito (para Títulos/Formularios)
                    })
            
        # Ordenar lista por nombre original para el combo
        MUNICIPIOS_LISTA_UI.sort(key=lambda x: x["name"])
        print(f" {len(MUNICIPIOS_LISTA_UI)} municipios cargados.")
    else:
        print(f"⚠️ AVISO: No se encuentra el archivo en {MUNICIPIOS_FILE}.")

except Exception as e:
    print(f"❌ ERROR procesando lista de municipios: {e}")


# --- CONFIGURAR JINJA2 ---
env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR, encoding="utf-8"),
    autoescape=select_autoescape(['html','xml'])
)
env.filters['fromjson'] = lambda v: json.loads(v) if v else None
    
# --- CARGAR PLANTILLAS ---
template_index = env.get_template(TEMPLATE_INDEX)
template_agua = env.get_template(TEMPLATE_AGUA)
template_obras = env.get_template(TEMPLATE_OBRAS)
template_residuos = env.get_template(TEMPLATE_RESIDUOS)
template_cementerios = env.get_template(TEMPLATE_CEMENTERIOS)
template_equipamientos = env.get_template(TEMPLATE_EQUIPAMIENTOS)
template_viario = env.get_template(TEMPLATE_VIARIO)
template_alumbrado = env.get_template(TEMPLATE_ALUMBRADO)
template_saneamiento = env.get_template(TEMPLATE_SANEAMIENTO)

# --- CONEXIÓN A BASE DE DATOS ---
def conectar():
    return psycopg2.connect(host=DB["host"], port=DB["port"], dbname=DB["dbname"], user=DB["user"], password=DB["password"])


def obtener_fase_actual(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT max(fase) FROM geonet_fase;")
        row = cur.fetchone()
        if row and row[0]:
            return int(row[0])
        return 2024 # Fallback por si la tabla está vacía

def obtener_depositos(conn, mun):
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        sql = """
        SELECT d.nombre, de.limpieza 
        FROM deposito d LEFT JOIN deposito_enc de USING (fase, mun, orden_depo) 
        WHERE d.fase = (SELECT max(fase) FROM geonet_fase) 
            AND d.mun = %s 
            AND de.titular  = 'MU'
        ORDER BY d.orden_depo;
        """
        cur.execute(sql, (mun,))
        return [{"nombre": r["nombre"] or "", "limpieza": str(r["limpieza"]) if r["limpieza"] else ""} for r in cur.fetchall()]

def obtener_obras(conn, mun):
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        sql = """
            SELECT clave, mun, orden, nombre, plan_obra, estado, proyecto,
            CASE WHEN estado = 'FI' THEN 2 ELSE 0 END as cond
            FROM geonet_obras
            WHERE fase = (SELECT max(fase) FROM geonet_fase) 
            AND mun = %s
            AND (
                (equipamientos IS NULL OR equipamientos = 'SI') OR
                (alumbrado IS NULL OR alumbrado = 'SI') OR
                (infra_viaria IS NULL OR infra_viaria = 'SI') OR
                (abastecimiento IS NULL OR abastecimiento = 'SI') OR
                (saneamiento IS NULL OR saneamiento = 'SI')
            )
            -- Se descartan las anuladas
            AND (estado IS NULL OR estado <> 'AN') 
            -- Se descartan las ejecutadas por el Área de Infraestructuras (Cooperacion) ya que ellos nos pasan estados y proyectos finales
            AND (ejecucion IS NULL OR ejecucion NOT IN ('DIIN')) 
            -- Se descartan actuaciones del PAE ya que el Área de Medio Ambiente nos facilita estados y proyectos
            AND (plan_obra IS NULL OR plan_obra NOT ILIKE '%%PAE %%')
            -- Se descartan actuaciones del Área de Ciclo Hídrico ya que ellos nos facilita estados y proyectos
            AND (subvencion IS NULL OR subvencion <> 'DICH')
            ORDER BY orden;
        """
        cur.execute(sql, (mun,))
        rows = cur.fetchall()
        
        obras = []
        for r in rows:
            obras.append({
                "clave": r["clave"], 
                "mun": r["mun"], 
                "orden": r["orden"],
                "nombre": r["nombre"], 
                "plan_obra": r["plan_obra"], 
                "estado": r["estado"],
                "proyecto": r["proyecto"], 
                "cond": r["cond"]
            })
        return obras

# --- OBTENCION DE REQUERIMIENTOS ESPECÍFICOS ---
def obtener_avisos_personalizados(conn, codigo_ine, fase, tipo_form):
    """
    Recupera los avisos específicos para un municipio y formulario.
    """
    sql = """
        SELECT mensaje, prioridad, url
        FROM coordinador.solicitud_datos_formularios
        WHERE mun = %s AND fase = %s AND tipo_formulario = %s
        ORDER BY prioridad DESC, id ASC
    """
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cursor:
            cursor.execute(sql, (codigo_ine, fase, tipo_form))
            # Al ser DictCursor, cada aviso ya llevará la clave 'url'
            return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        print(f"Error obteniendo avisos para {codigo_ine} ({tipo_form}): {e}")
        return []
        
# --- OBTENCION DE CEMENTERIOS ---
def obtener_cementerios(conn, mun):
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute("SELECT nombre FROM cementerio WHERE fase = (SELECT max(fase) FROM geonet_fase) AND mun = %s ORDER BY nombre;", (mun,))
        return [{"nombre": r["nombre"] or "Sin nombre"} for r in cur.fetchall()]

def copiar_assets():
    if os.path.exists(ASSETS_CSS_DIR):
        shutil.copytree(ASSETS_CSS_DIR, os.path.join(OUTPUT_DIR, 'css'), dirs_exist_ok=True)
    if os.path.exists(ASSETS_DIR):
        shutil.copytree(ASSETS_DIR, os.path.join(OUTPUT_DIR, 'assets'), dirs_exist_ok=True)

# --- OBTENCION DE EQUIPAMIENTOS ---
def obtener_equipamientos(conn, mun):
    sql = """
    with t as (
        select 'CASA CONSISTORIAL' as tabla, cc.clave || cc.mun || cc.orden_casa as cod, cc.nombre, cc.estado, '316' capa, idu, cc.geom from casa_consistorial cc where cc.fase = (select max(fase) from geonet_fase) and cc.mun = %s
        UNION select 'CENTRO CULTURAL', cu.clave || cu.mun || cu.orden_centro, cu.nombre, cu.estado, '321', idu, cu.geom from cent_cultural cu where cu.fase = (select max(fase) from geonet_fase) and cu.mun = %s
        UNION select 'CENTRO ASISTENCIAL', ca.clave || ca.mun || ca.orden_casis, ca.nombre, ca.estado, '319', idu, ca.geom from centro_asistencial ca where ca.fase = (select max(fase) from geonet_fase) and ca.mun = %s
        UNION select 'CENTRO ENSEÑANZA', en.clave || en.mun || en.orden_cent, en.nombre, en.estado, '322', idu, en.geom from centro_ensenanza en where en.fase = (select max(fase) from geonet_fase) and en.mun = %s
        UNION select 'CENTRO SANITARIO', sa.clave || sa.mun || sa.orden_csan, sa.nombre, sa.estado, '327', idu, sa.geom from centro_sanitario sa where sa.fase = (select max(fase) from geonet_fase) and sa.mun = %s
        UNION select 'EDIFICIO SIN USO', su.clave || su.mun || su.orden_edific, su.nombre, su.estado, '328', idu, su.geom from edific_pub_sin_uso su where su.fase = (select max(fase) from geonet_fase) and su.mun = %s
        UNION select 'INSTALACIÓN DEPORTIVA', id.clave || id.mun || id.orden_instal, id.nombre, id.estado, '323', idu, id.geom from instal_deportiva id where id.fase = (select max(fase) from geonet_fase) and id.mun = %s
        UNION select 'MERCADO/LONJA', lm.clave || lm.mun || lm.orden_lmf, lm.nombre, lm.estado, '324', idu, lm.geom from lonja_merc_feria lm where lm.fase = (select max(fase) from geonet_fase) and lm.mun = %s
        UNION select 'PARQUE', pj.clave || pj.mun || pj.orden_parq, pj.nombre, pj.estado, '331', idu, pj.geom from parque pj where pj.fase = (select max(fase) from geonet_fase) and pj.mun = %s
        UNION select 'PROTECCIÓN CIVIL', ip.clave || ip.mun || ip.orden_prot, ip.nombre, ip.estado, '325', idu, ip.geom from proteccion_civil ip where ip.fase = (select max(fase) from geonet_fase) and ip.mun = %s
        UNION select 'TANATORIO', ta.clave || ta.mun || ta.orden_tanat, ta.nombre, ta.estado, '326', idu, ta.geom from tanatorio ta where ta.fase = (select max(fase) from geonet_fase) and ta.mun = %s
    )
    select t.*, 
        case when estado='B' then 'Bueno' when estado='R' then 'Regular' when estado='M' then 'Malo' when estado='E' then 'En ejecución' else 'Desconocido' end as estado_txt,
        concat('https://visoreiel.geonet.es/Manejadores/ObtenerMIME.ashx?entidad=', capa, '&atributo=foto&tipo=image/jpeg;jpg&identificador=', idu) as url_foto,
        concat('https://visoreiel.geonet.es?srs=4326&x_lon=', st_x(st_centroid(st_transform(geom, 4326))), '&y_lat=', st_y(st_centroid(st_transform(geom, 4326))), '&zoom=19&w=initlayer&layerIds=', capa) as url_visor
    from t;
    """
    
    # Mapeo de iconos de Lucide para cada categoría
    iconos = {
        'CASA CONSISTORIAL': 'landmark', 'CENTRO CULTURAL': 'library', 'CENTRO ASISTENCIAL': 'heart-pulse',
        'CENTRO ENSEÑANZA': 'graduation-cap', 'CENTRO SANITARIO': 'hospital', 'EDIFICIO SIN USO': 'ghost',
        'INSTALACIÓN DEPORTIVA': 'volleyball', 'MERCADO/LONJA': 'shopping-cart', 'PARQUE': 'tree-pine',
        'PROTECCIÓN CIVIL': 'shield-alert', 'TANATORIO': 'flower-2'
    }
    
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(sql, (mun,) * 11)
        res = cur.fetchall()
        
        agrupados = {}
        edificios_sin_uso = []
        
        for r in res:
            r_dict = dict(r)
            r_dict['icono'] = iconos.get(r['tabla'], 'building')
            
            if r['tabla'] == 'EDIFICIO SIN USO':
                edificios_sin_uso.append(r_dict)
            else:
                cat = r['tabla']
                if cat not in agrupados: agrupados[cat] = []
                agrupados[cat].append(r_dict)
                
        return {"general": agrupados, "sin_uso": edificios_sin_uso}
        
def main():
    print("--- INICIO GENERACIÓN ---")
    if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)
    copiar_assets()
    
    conn = None
    
    # Diccionario para almacenar las banderas de cada municipio para el index.html único
    config_municipios_js = {}

    try:
        conn = conectar()
        fase_actual = obtener_fase_actual(conn)
        fase_anterior = fase_actual - 1
        
        print(f"Generando formularios para Fase {fase_actual}...")
        
        for m in MUNICIPIOS_LISTA_UI:
            code = m["code"]       # El código tal cual viene del TSV
            name_display = m["name_bonito"] 
            
            # EL CAMBIO: Usamos 'code' directamente para la BD, asumiendo que coincide
            code_bd = code 
            
            common_ctx = {
                "muni_code": code, 
                "muni_display": name_display,
                "url_adjuntos": URL_ADJUNTOS, 
                "url_generar_pdf": URL_GENERAR_PDF,
                "url_logger": URL_LOGGER,
                "fase_anterior": fase_anterior,
                "fase_actual": fase_actual
            }

            # --- A) FORMULARIOS ESTÁNDAR (Siempre se generan) ---

            # 1. AGUA
            depositos = obtener_depositos(conn, code_bd)
            avisos_agua = obtener_avisos_personalizados(conn, code_bd, fase_actual, 'agua')
            
            with open(os.path.join(OUTPUT_DIR, f'agua_{code}.html'), "w", encoding="utf-8") as f:
                f.write(template_agua.render(
                    **common_ctx, 
                    depositos_json=json.dumps(depositos, ensure_ascii=False),
                    avisos_personalizados=avisos_agua
                ))

            # 2. OBRAS
            obras = obtener_obras(conn, code_bd)
            avisos_obras = obtener_avisos_personalizados(conn, code_bd, fase_actual, 'obras')

            with open(os.path.join(OUTPUT_DIR, f'obras_{code}.html'), "w", encoding="utf-8") as f:
                f.write(template_obras.render(
                    **common_ctx, 
                    obras=obras,
                    avisos_personalizados=avisos_obras
                ))

            # 3. RESIDUOS
            avisos_residuos = obtener_avisos_personalizados(conn, code_bd, fase_actual, 'residuos')

            with open(os.path.join(OUTPUT_DIR, f'residuos_{code}.html'), "w", encoding="utf-8") as f:
                f.write(template_residuos.render(
                    **common_ctx,
                    avisos_personalizados=avisos_residuos
                ))

            # 4. CEMENTERIOS
            cementerios = obtener_cementerios(conn, code_bd)
            avisos_cementerios = obtener_avisos_personalizados(conn, code_bd, fase_actual, 'cementerios')

            with open(os.path.join(OUTPUT_DIR, f'cementerios_{code}.html'), "w", encoding="utf-8") as f:
                f.write(template_cementerios.render(
                    **common_ctx, 
                    cementerios=cementerios, 
                    cementerios_json=json.dumps(cementerios, ensure_ascii=False),
                    avisos_personalizados=avisos_cementerios
                ))
                
            # 5. EQUIPAMIENTOS (Nuevo bloque)
            equip_data = obtener_equipamientos(conn, code_bd)
            avisos_equip = obtener_avisos_personalizados(conn, code_bd, fase_actual, 'equipamientos')

            with open(os.path.join(OUTPUT_DIR, f'equipamientos_{code}.html'), "w", encoding="utf-8") as f:
                f.write(template_equipamientos.render(
                    **common_ctx,
                    equipamientos_agrupados=equip_data,
                    avisos_personalizados=avisos_equip
                ))
            
            # --- B) FORMULARIOS BAJO DEMANDA (Condicionales) ---
            # Banderas por defecto para este municipio
            flag_alumbrado = False
            flag_viario = False
            flag_saneamiento = False

            # 6. ALUMBRADO
            avisos_alumbrado = obtener_avisos_personalizados(conn, code_bd, fase_actual, 'alumbrado')
            if len(avisos_alumbrado) > 0:
                flag_alumbrado = True
                with open(os.path.join(OUTPUT_DIR, f'alumbrado_{code}.html'), "w", encoding="utf-8") as f:
                    f.write(template_alumbrado.render(
                        **common_ctx,
                        avisos_personalizados=avisos_alumbrado
                    ))

            # 7. VIARIO
            avisos_viario = obtener_avisos_personalizados(conn, code_bd, fase_actual, 'viario')
            if len(avisos_viario) > 0:
                flag_viario = True
                with open(os.path.join(OUTPUT_DIR, f'viario_{code}.html'), "w", encoding="utf-8") as f:
                    f.write(template_viario.render(
                        **common_ctx,
                        avisos_personalizados=avisos_viario
                    ))

            # 8. SANEAMIENTO
            avisos_saneamiento = obtener_avisos_personalizados(conn, code_bd, fase_actual, 'saneamiento')
            if len(avisos_saneamiento) > 0:
                flag_saneamiento = True
                with open(os.path.join(OUTPUT_DIR, f'saneamiento_{code}.html'), "w", encoding="utf-8") as f:
                    f.write(template_saneamiento.render(
                        **common_ctx,
                        avisos_personalizados=avisos_saneamiento
                    ))

            # GUARDAR LAS FLAGS EN EL DICCIONARIO MAESTRO
            # (El index.html usará esto para mostrar/ocultar botones)
            config_municipios_js[code] = {
                'alumbrado': flag_alumbrado,
                'viario': flag_viario,
                'saneamiento': flag_saneamiento
            }

        # --- GENERAR INDEX ÚNICO (Al final del bucle) ---
        print(f"Generando Index maestro...")
        with open(os.path.join(OUTPUT_DIR, "index.html"), "w", encoding="utf-8") as f:
            f.write(template_index.render(
                fase_actual=fase_actual,
                municipios_lista=json.dumps(MUNICIPIOS_LISTA_UI, ensure_ascii=False),
                # Pasamos el mapa de flags al JavaScript del Index
                config_flags_json=json.dumps(config_municipios_js, ensure_ascii=False), 
                url_login_api=URL_LOGIN_SCRIPT
            ))
            
        print("\n Proceso finalizado.")

    except Exception as e:
        print(f"\n❌ ERROR CRÍTICO: {e}")
        import traceback; traceback.print_exc()
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    main()