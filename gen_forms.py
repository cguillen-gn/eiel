#!/usr/bin/env python3
# gen_forms.py
import os, json, sys, csv, shutil
from jinja2 import Environment, FileSystemLoader, select_autoescape
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()

# --- CONSTANTES GLOBALES Y RUTAS ---
# 1. BASE_DIR: Dónde está este archivo script.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. OUTPUT_DIR: La ÚNICA carpeta donde se generará todo (HTML, CSS, JS)
OUTPUT_DIR = os.path.join(BASE_DIR, 'dist')

# 3. Carpetas de ORIGEN (Donde tú editas, relativas a BASE_DIR)
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")
ASSETS_CSS_DIR = os.path.join(BASE_DIR, "css")
ASSETS_JS_DIR = os.path.join(BASE_DIR, "js") # Si tienes JS

# --- CONFIGURACIÓN DE NOMBRES DE PLANTILLAS ---
TEMPLATE_INDEX = "index-template.html.j2" 
TEMPLATE_AGUA = "form-agua.html.j2"
TEMPLATE_OBRAS = "form-obras.html.j2"
TEMPLATE_RESIDUOS = "form-residuos.html.j2"
TEMPLATE_CEMENTERIOS = "form-cementerios.html.j2"

# ---------------- CONFIGURACIÓN ----------------
DB = {
    "host": "172.23.0.8",
    "port": 5432,
    "dbname": "EIEL",
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD")
}

MUNICIPIOS_TSV = "municipios.tsv"

# URLs de Apps Script (Centralizadas)
URL_ADJUNTOS = "https://script.google.com/macros/s/AKfycbySvcn7wgRbbNhnoKYPND7Ij7CaPgLzFKbNq-AfX80CkyV1J7aIKUQ8tQGYmmKBNQjb8A/exec"
URL_GOOGLE_FORMS = "https://docs.google.com/forms/d/e/1FAIpQLSc84PLY4O2wM9ek3v6L14DzZ8jcqDtFeKOK01i38s7ttPt0Ng/formResponse"
URL_GENERAR_PDF = "https://script.google.com/macros/s/AKfycbyxhsTZynldpFj9kyUIYmtflvHKvKr_ew4mRaB8LlnqEh5gxAC5f1ORRjIY2unS5ioO/exec"

# ---------------- FIREBASE CONFIG ----------------
FIREBASE_CONFIG = {
    "apiKey": os.getenv("FIREBASE_API_KEY"), 
    "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
    "projectId": os.getenv("FIREBASE_PROJECT_ID"),
    "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
    "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"),
    "appId": os.getenv("FIREBASE_APP_ID"),
    "measurementId": os.getenv("FIREBASE_MEASUREMENT_ID")
}
# ---------------- END CONFIG ----------------

# Cargar Mapeo de Emails
MAPPING_FILE = "auth_mapping.json"
EMAIL_TO_CODE_MAP = {}
try:
    if os.path.exists(MAPPING_FILE):
        with open(MAPPING_FILE, "r", encoding="utf-8") as f:
            EMAIL_TO_CODE_MAP = json.load(f)
        print(f"✅ Mapeo de autorización cargado.")
    else:
        print(f"⚠️ No se encontró {MAPPING_FILE}.")
except Exception as e:
    print(f"❌ ERROR mapeo auth: {e}")


# Configurar Jinja2
env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR, encoding="utf-8"),
    autoescape=select_autoescape(['html','xml'])
)

def from_json_filter(value):
    if not value:
        return None
    return json.loads(value)

env.filters['fromjson'] = from_json_filter
    
# Cargamos las plantillas
template_index = env.get_template(TEMPLATE_INDEX)
template_agua = env.get_template(TEMPLATE_AGUA)
template_obras = env.get_template(TEMPLATE_OBRAS)
template_residuos = env.get_template(TEMPLATE_RESIDUOS)
template_cementerios = env.get_template(TEMPLATE_CEMENTERIOS)

def conectar():
    """Conexión a BD."""
    return psycopg2.connect(
        host=DB["host"], port=DB["port"], dbname=DB["dbname"],
        user=DB["user"], password=DB["password"], client_encoding='UTF8'
    )

def obtener_fase_actual(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT max(fase) FROM geonet_fase;")
        return int(cur.fetchone()[0])

def cargar_mapado_municipios(path):
    d = {}
    if not os.path.exists(path): return d
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        tsv_reader = csv.reader(fh, delimiter='\t')
        for row in tsv_reader:
            if len(row) >= 2 and row[0].strip():
                try:
                    code_norm = str(int(row[0].strip()[-3:])).zfill(3)
                    d[code_norm] = row[1].strip()
                except ValueError: pass
    return d

def obtener_municipios(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT mun FROM municipio WHERE fase = (SELECT max(fase) FROM geonet_fase) and prov = '03' ORDER BY mun;")
        return [r[0] for r in cur.fetchall()]

def obtener_depositos(conn, mun):
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute("""
            SELECT d.nombre, de.limpieza
            FROM deposito d
            LEFT JOIN deposito_enc de USING (fase, mun, orden_depo)
            WHERE d.fase = (SELECT max(fase) FROM geonet_fase) AND d.mun = %s
            ORDER BY d.orden_depo;
        """, (mun,))
        return [{"nombre": r["nombre"] or "", "limpieza": str(r["limpieza"]) if r["limpieza"] else ""} for r in cur.fetchall()]

def obtener_obras(conn, mun):
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        # Tu consulta original de obras (simplificada aquí para brevedad, mantén la tuya completa)
        sql = """
            SELECT clave, mun, orden, nombre, plan_obra, 
            CASE WHEN estado = 'FI' THEN 2 ELSE 1 END as cond
            FROM geonet_obras
            WHERE fase = (SELECT max(fase) FROM geonet_fase) 
            AND mun = %s
            AND (
                (estado IS NULL OR estado NOT IN ('FI','AN')) -- Condición 1: No iniciadas/En curso
                OR 
                (estado = 'FI' AND (proyecto IS NULL OR proyecto <> 'SI')) -- Condición 2: Finalizadas sin proyecto
            )
        """
        cur.execute(sql, (mun,))
        rows = cur.fetchall()
        
        obras = []
        for r in rows:
            obras.append({
                "clave": r["clave"], "mun": r["mun"], "orden": r["orden"],
                "nombre": r["nombre"], "plan_obra": r["plan_obra"], "cond": r["cond"]
            })
        return obras

def obtener_cementerios(conn, mun):
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute("SELECT nombre FROM cementerio WHERE fase = (SELECT max(fase) FROM geonet_fase) AND mun = %s ORDER BY nombre;", (mun,))
        return [{"nombre": r["nombre"] or "Sin nombre"} for r in cur.fetchall()]

def copiar_assets():
    src_css = ASSETS_CSS_DIR
    dest_css = os.path.join(OUTPUT_DIR, 'css')

    if os.path.exists(src_css):
        shutil.copytree(src_css, dest_css, dirs_exist_ok=True)
        print(f"✅ CSS copiado a {dest_css}")

def main():
    print("--- INICIO GENERACIÓN DE FORMULARIOS ---")
    
    # 1. Asegurar el directorio de salida (dist)
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"📂 Carpeta creada: {OUTPUT_DIR}")
    
    # 2. Copiar CSS y JS
    copiar_assets()
    
    # 3. Cargar datos base
    try:
        mmap = cargar_mapado_municipios(MUNICIPIOS_TSV) 
    except Exception as e:
        print(f"⚠️ No se pudo cargar el mapa de municipios: {e}")
        mmap = {} # Evitamos que falle si falta el archivo

    try:
        conn = conectar()
        fase_actual = obtener_fase_actual(conn)
        fase_anterior = fase_actual - 1
        raw_munis = obtener_municipios(conn)
        
        municipios_data = []
        for m in raw_munis:
            code = str(m).zfill(3)
            # Usamos .get por si el código no está en el TSV
            municipios_data.append({"code": code, "name": mmap.get(code, f"Municipio {code}")})

        # 4. Generar Index
        print(f"Generando Index para {len(municipios_data)} municipios...")
        
        # CUIDADO: Asegúrate de que FIREBASE_CONFIG y EMAIL_TO_CODE_MAP están definidos arriba
        rendered_index = template_index.render(
            fase_actual=fase_actual,
            municipios_json_data=json.dumps(municipios_data, ensure_ascii=False),
            firebase_config_data=json.dumps(FIREBASE_CONFIG), 
            mapeo_email_codigo_data=json.dumps(EMAIL_TO_CODE_MAP)
        )
        
        # Guardamos en OUTPUT_DIR
        with open(os.path.join(OUTPUT_DIR, "index.html"), "w", encoding="utf-8") as f:
            f.write(rendered_index)

        # 5. Generar Formularios por Municipio
        print("Generando formularios específicos...")
        for m in municipios_data:
            code = m["code"]
            name = m["name"]
            
            common_ctx = {
                "muni_code": code,
                "muni_display": name,
                "url_adjuntos": URL_ADJUNTOS,
                "url_generar_pdf": URL_GENERAR_PDF,
                "url_google_forms": URL_GOOGLE_FORMS,
                "fase_anterior": fase_anterior
            }

            # --- AGUA ---
            depositos = obtener_depositos(conn, code)
            with open(os.path.join(OUTPUT_DIR, f'agua_{code}.html'), "w", encoding="utf-8") as f:
                f.write(template_agua.render(
                    **common_ctx,
                    depositos_json=json.dumps(depositos, ensure_ascii=False)
                ))

            # --- OBRAS ---
            obras = obtener_obras(conn, code)
            with open(os.path.join(OUTPUT_DIR, f'obras_{code}.html'), "w", encoding="utf-8") as f:
                f.write(template_obras.render(
                    **common_ctx,
                    obras=obras,
                    obras_json=json.dumps(obras, ensure_ascii=False)
                ))

            # --- RESIDUOS ---
            with open(os.path.join(OUTPUT_DIR, f'residuos_{code}.html'), "w", encoding="utf-8") as f:
                f.write(template_residuos.render(**common_ctx))

            # --- CEMENTERIOS ---
            cementerios = obtener_cementerios(conn, code)
            with open(os.path.join(OUTPUT_DIR, f'cementerios_{code}.html'), "w", encoding="utf-8") as f:
                f.write(template_cementerios.render(
                    **common_ctx,
                    cementerios=cementerios,
                    cementerios_json=json.dumps(cementerios, ensure_ascii=False)
                ))
            
        print("\n✅ Proceso finalizado con éxito.")

    except Exception as e:
        print(f"\n❌ ERROR FATAL en el proceso principal: {e}")
        import traceback
        traceback.print_exc() # Esto te ayudará mucho a ver la línea exacta del error
    finally:
        if 'conn' in locals() and conn: 
            conn.close()
            print("🔌 Conexión cerrada.")

if __name__ == '__main__':
    main()