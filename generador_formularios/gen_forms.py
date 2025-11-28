#!/usr/bin/env python3
# gen_forms.py
import os, json, sys, csv 
from jinja2 import Environment, FileSystemLoader, select_autoescape
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()

# ---------------- CONFIG - Rellena con tus datos ----------------
DB = {
    "host": "172.23.0.8",
    "port": 5432,
    "dbname": "EIEL",
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD")
}
TEMPLATE_DIR = "templates"
TEMPLATE_INDEX = "index-template.html.j2" 
TEMPLATE_AGUA = "form-agua-template.html.j2"
TEMPLATE_OBRAS = "form-obras-template.html.j2"
TEMPLATE_RESIDUOS = "form-residuos-template.html.j2"
TEMPLATE_CEMENTERIOS = "form-cementerios-template.html.j2"
OUT_DIR = r"C:\Users\cguillen.GEONET\Documents\GitHub\eiel-prototipo\formularios"
OUT_DIR_INDEX = r"C:\Users\cguillen.GEONET\Documents\GitHub\eiel-prototipo"

MUNICIPIOS_TSV = "municipios.tsv"


URL_ADJUNTOS = "https://script.google.com/macros/s/AKfycbxFEc0MnM5VuhpPIznJAXYOc72SpdUHRp-TeyLIsMmuszJCEbYhNX38scRGUl0rSJU/exec"
URL_GOOGLE_FORMS = "https://docs.google.com/forms/d/e/1FAIpQLSc84PLY4O2wM9ek3v6L14DzZ8jcqDtFeKOK01i38s7ttPt0Ng/formResponse"
URL_GENERAR_PDF = "https://script.google.com/macros/s/AKfycbwL9SvRO8qTK4JRWycmJfIL3sUaRgocSrKSaAhvUo8hYDEPFnYfUl8WulXeuMGNWXI/exec";
# ---------------- END CONFIG -----------------------------------

# ---------------- FIREBASE CONFIG - PEGAR AQUI TUS VALORES REALES ----------------
FIREBASE_CONFIG = {
    "apiKey": os.getenv("FIREBASE_API_KEY"), 
    "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
    "projectId": os.getenv("FIREBASE_PROJECT_ID"),
    "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
    "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"),
    "appId": os.getenv("FIREBASE_APP_ID"),
    "measurementId": os.getenv("FIREBASE_MEASUREMENT_ID")
}
# ---------------- END CONFIG -----------------------------------

# ---------------- MAPEO EMAIL -> CÓDIGO MUNICIPAL (AUTORIZACIÓN) ----------------
MAPPING_FILE = "auth_mapping.json"
EMAIL_TO_CODE_MAP = {} # Inicializar vacío

try:
    if os.path.exists(MAPPING_FILE):
        with open(MAPPING_FILE, "r", encoding="utf-8") as f:
            EMAIL_TO_CODE_MAP = json.load(f)
        print(f"✅ Mapeo de autorización cargado desde {MAPPING_FILE}.")
    else:
        print(f"❌ ADVERTENCIA: No se encontró el archivo de mapeo {MAPPING_FILE}.")
except Exception as e:
    print(f"❌ ERROR al cargar el mapeo de autorización: {e}")

# ---------------- END CONFIG -----------------------------------


env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR, encoding="utf-8"),
    autoescape=select_autoescape(['html','xml'])
)
template_index = env.get_template(TEMPLATE_INDEX)
template_agua = env.get_template(TEMPLATE_AGUA)
template_obras = env.get_template(TEMPLATE_OBRAS)
template_residuos = env.get_template(TEMPLATE_RESIDUOS)
template_cementerios = env.get_template(TEMPLATE_CEMENTERIOS)

def conectar():
    """Establece la conexión a la base de datos PostgreSQL."""
    try:
        conn = psycopg2.connect(
            host=DB["host"], port=DB["port"], dbname=DB["dbname"],
            user=DB["user"], password=DB["password"], client_encoding='UTF8'
        )
        print("✅ Conexión a BD establecida.")
        return conn
    except psycopg2.Error as e:
        # Si la conexión falla, se lanza la excepción y se gestiona en el main
        raise ConnectionError(f"Error FATAL de conexión a PostgreSQL: {e}")

def obtener_fase_actual(conn):
    """Obtiene la fase (año) de la última campaña EIEL registrada en la BD."""
    try:
        cur = conn.cursor()
        # Selecciona la fase máxima (ej. 2024)
        cur.execute("SELECT max(fase) FROM geonet_fase;")
        fase = cur.fetchone()[0]
        cur.close()
        return int(fase)
    except Exception as e:
        print(f"❌ Error al obtener fase actual: {e}")
        return 0 # Valor por defecto si falla
        
def cargar_mapado_municipios(path):
    """
    Carga el mapeo Código-Nombre desde el archivo TSV,
    normalizando los códigos a 3 dígitos (ej. '001') y realizando una limpieza robusta.
    """
    d = {}
    if not os.path.exists(path):
        print(f"❌ ERROR: El archivo de mapeo de municipios no se encontró en: {path}")
        return d
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            tsv_reader = csv.reader(fh, delimiter='\t')
            for row in tsv_reader:
                if len(row) >= 2:
                    code_raw = row[0].strip()
                    name = row[1].strip()

                    if code_raw and name:
                        code_to_normalize = code_raw
                        
                        # Manejo de códigos con prefijo de provincia (ej: '03001')
                        if len(code_raw) > 3:
                            code_to_normalize = code_raw[-3:]
                        
                        try:
                            code_int = int(code_to_normalize)
                            code_normalized = str(code_int).zfill(3) 
                            
                            d[code_normalized] = name
                            print(f"  DEBUG: Mapeado {code_normalized} -> {name}")  # ← AÑADIDO para debug
                        except ValueError:
                            print(f"⚠️ ADVERTENCIA: Se omitió la fila con código no numérico/inválido: {code_raw}")
                            continue

        print(f"✅ Mapa municipios cargado: {len(d)} entradas.")
    except Exception as e:
        print(f"❌ ERROR al leer {path}: {e}")
    return d

def obtener_municipios(conn):
    """Obtiene los códigos de municipio (mun) para la provincia '03' en la fase actual."""
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT mun
            FROM municipio
            WHERE fase = (SELECT max(fase) FROM geonet_fase) and prov = '03'
            ORDER BY mun;
        """)
        rows = cur.fetchall()
        cur.close()
        return [r[0] for r in rows]
    except psycopg2.Error as e:
        print(f"❌ Error BD en obtener_municipios: {e}")
        return [] # Devolver lista vacía si falla

def obtener_depositos(conn, mun):
    """Consulta datos de depósitos para un municipio específico."""
    print(f"DEBUG: Consultando depósitos para municipio: {mun}") # <-- AÑADIDO
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("""
            SELECT d.mun, d.orden_depo, d.nombre, de.limpieza
            FROM deposito d
            LEFT JOIN deposito_enc de USING (fase, mun, orden_depo)
            WHERE d.fase = (SELECT max(fase) FROM geonet_fase) AND d.mun = %s
            ORDER BY d.orden_depo;
        """, (mun,))
        rows = cur.fetchall()
        cur.close()
        
        depositos = []
        for r in rows:
            depositos.append({
                "nombre": r["nombre"] if r["nombre"] is not None else "",
                "limpieza": str(r["limpieza"]) if r["limpieza"] is not None else ""
            })
        
        # AÑADIDO: Imprime el resultado de la consulta antes de salir.
        print(f"DEBUG: Resultado final de depósitos para {mun}: {depositos}") 
        
        return depositos
        
    except psycopg2.Error as e:
        print(f"❌ Error BD en obtener_depositos para {mun}: {e}")
        return []

def obtener_obras(conn, mun):
    """Consulta obras según las condiciones EIEL para un municipio específico."""
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

        # Condición 1: Obras pendientes (estado NULL o no 'FI'/'AN') y con afectación a infraestructura
        cur.execute("""
            SELECT clave, mun, orden, nombre, plan_obra, 1 as cond
            FROM geonet_obras
            WHERE fase = (SELECT max(fase) FROM geonet_fase) 
            AND (estado IS NULL OR estado NOT IN ('FI','AN'))
            AND (equipamientos IS NULL OR equipamientos = 'SI'
                OR alumbrado IS NULL OR alumbrado = 'SI'
                OR infra_viaria IS NULL OR infra_viaria = 'SI'
                OR abastecimiento IS NULL OR abastecimiento = 'SI'
                OR saneamiento IS NULL OR saneamiento = 'SI')
            AND (proyecto IS NULL OR proyecto <> 'SI')
            AND mun = %s
        """, (mun,))
        c1 = cur.fetchall()

        # Condición 2: Obras finalizadas ('FI') pero que aún no tienen proyecto definido
        cur.execute("""
            SELECT clave, mun, orden, nombre, plan_obra, 2 as cond
            FROM geonet_obras
            WHERE fase = (SELECT max(fase) FROM geonet_fase) 
            AND estado = 'FI'
            AND (equipamientos IS NULL OR equipamientos = 'SI'
                OR alumbrado IS NULL OR alumbrado = 'SI'
                OR infra_viaria IS NULL OR infra_viaria = 'SI'
                OR abastecimiento IS NULL OR abastecimiento = 'SI'
                OR saneamiento IS NULL OR saneamiento = 'SI')
            AND (proyecto IS NULL OR proyecto <> 'SI')
            AND mun = %s
        """, (mun,))
        c2 = cur.fetchall()
        cur.close()

        obras = []
        for r in (c1 + c2):
            obras.append({
                "clave": r["clave"],      
                "mun": r["mun"],      
                "orden": r["orden"],      
                "nombre": r["nombre"],
                "plan_obra": r["plan_obra"],
                "cond": r["cond"]
            })
        return obras
        
    except psycopg2.Error as e:
        print(f"❌ Error BD en obtener_obras para {mun}: {e}")
        return [] # Devolver lista vacía si falla

def obtener_cementerios(conn, mun):
    """Consulta cementerios para un municipio específico."""
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("""
            SELECT nombre
            FROM cementerio
            WHERE fase = (SELECT max(fase) FROM geonet_fase) 
            AND mun = %s
            ORDER BY nombre;
        """, (mun,))
        rows = cur.fetchall()
        cur.close()
        
        cementerios = []
        for r in rows:
            cementerios.append({
                "nombre": r["nombre"] if r["nombre"] is not None else "Sin nombre"
            })
        return cementerios
        
    except psycopg2.Error as e:
        print(f"❌ Error BD en obtener_cementerios para {mun}: {e}")
        return []
        
def asegurar_carpeta(path):
    """Asegura que la carpeta de salida exista."""
    os.makedirs(path, exist_ok=True)

def main():
    """Función principal para generar los formularios."""
    print("--- INICIO DEL PROCESO DE GEOPROCESAMIENTO Y GENERACIÓN ---")
    asegurar_carpeta(OUT_DIR)
    
    mmap = cargar_mapado_municipios(MUNICIPIOS_TSV)
    
    conn = None
    try:
        conn = conectar()
        
        fase_actual = obtener_fase_actual(conn)
        fase_anterior = fase_actual - 1
        
        municipios = obtener_municipios(conn)
        print("Municipios detectados en BD:", municipios)
        
        if not municipios:
            print("⚠️ ADVERTENCIA: No se encontraron municipios en la BD para la provincia '03'. No se generarán formularios.")
            return 

        # ---------------------------------------------
        # 1. PREPARACIÓN DE DATOS PARA EL INDEX.HTML
        # ---------------------------------------------
        municipios_con_nombres = []
        for mun in municipios:
            # mun viene de la BD (ej. 1, 66, '001', '066'). Lo normalizamos a string de 3 dígitos.
            mun_code = str(mun).zfill(3)
            
            # Mapeo del código geoespacial al nombre geográfico
            muni_display = mmap.get(mun_code, f"Código {mun_code} (No mapeado)")
            
            # Construye la lista de municipios para el INDEX y para el loop
            municipios_con_nombres.append({
                "code": mun_code,
                "name": muni_display
            })

        # ---------------------------------------------
        # 2. GENERACIÓN DEL PANEL PRINCIPAL (index.html)
        # ---------------------------------------------
        
      
        print(f"DEBUG: Renderizando index.html (Genérico) con el listado de {len(municipios_con_nombres)} municipios.")
        
        # Pasamos la lista completa de municipios como JSON
        municipios_json = json.dumps(municipios_con_nombres, ensure_ascii=False)
        
        # NUEVO: Preparamos los JSON para el JavaScript
        firebase_config_json = json.dumps(FIREBASE_CONFIG)
        mapeo_email_codigo_json = json.dumps(EMAIL_TO_CODE_MAP) 
        
        rendered_index = template_index.render(
            fase_actual = fase_actual,
            municipios_json_data = municipios_json,
            firebase_config_data = firebase_config_json,
            mapeo_email_codigo_data = mapeo_email_codigo_json 
        )

        # Generación del archivo index.html en el directorio superior
        outpath_index = os.path.join(OUT_DIR_INDEX, "index.html")
        with open(outpath_index, "w", encoding="utf-8") as f:
            f.write(rendered_index)
        print("✅ Generado archivo de entrada (index.html):", outpath_index)


        # ---------------------------------------------
        # 3. GENERACIÓN DE FORMULARIOS ESPECÍFICOS (Loop)
        # ---------------------------------------------
        print("\n--- Generando formularios específicos por municipio ---")
        for mun_data in municipios_con_nombres:
            mun_code = mun_data["code"]
            muni_display = mun_data["name"] 
            
            # Se han omitido los detalles de la generación de los forms por ser repetitivos

            # ---- AGUA ----
            depositos = obtener_depositos(conn, mun_code)
            depositos_json = json.dumps(depositos, ensure_ascii=False)
            rendered_agua = template_agua.render(
                muni_code = mun_code, 
                muni_display = muni_display, 
                depositos_json = depositos_json,
                url_adjuntos = URL_ADJUNTOS, 
                url_google_forms = URL_GOOGLE_FORMS, 
                fase_anterior = fase_anterior,
                
                # ESTA ES LA LÍNEA QUE FALTABA:
                url_generar_pdf = URL_GENERAR_PDF 
            )
            
            # ---- OBRAS ----
            obras = obtener_obras(conn, mun_code)
            obras_json = json.dumps(obras, ensure_ascii=False)
            rendered_obras = template_obras.render(
                muni_code = mun_code, muni_display = muni_display, obras = obras, obras_json = obras_json,
                url_adjuntos = URL_ADJUNTOS, url_google_forms = URL_GOOGLE_FORMS
            )
            
            # ---- RESIDUOS ----
            rendered_residuos = template_residuos.render(
                muni_code = mun_code, muni_display = muni_display,
                url_adjuntos = URL_ADJUNTOS, url_google_forms = URL_GOOGLE_FORMS, fase_anterior = fase_anterior
            )
            
            # ---- CEMENTERIOS ----
            cementerios = obtener_cementerios(conn, mun_code)
            cementerios_json = json.dumps(cementerios, ensure_ascii=False)
            rendered_cementerios = template_cementerios.render(
                muni_code = mun_code, 
                muni_display = muni_display, 
                cementerios = cementerios,
                cementerios_json = cementerios_json,
                url_adjuntos = URL_ADJUNTOS, 
                url_google_forms = URL_GOOGLE_FORMS
            )
            
            
            
            # Guardado de archivos
            path_agua = os.path.join(OUT_DIR, f'agua_{mun_code}.html')
            path_obras = os.path.join(OUT_DIR, f'obras_{mun_code}.html')
            path_residuos = os.path.join(OUT_DIR, f'residuos_{mun_code}.html')
            path_cementerios = os.path.join(OUT_DIR, f'cementerios_{mun_code}.html')
            
            

            with open(path_agua, "w", encoding="utf-8") as f:
                f.write(rendered_agua)
            
            with open(path_obras, "w", encoding="utf-8") as f:
                f.write(rendered_obras)
                
            with open(path_residuos, 'w', encoding='utf-8') as f:
                f.write(rendered_residuos)
                
            with open(path_cementerios, 'w', encoding='utf-8') as f:
                f.write(rendered_cementerios)
            
            # Imprimir las rutas para que el usuario pueda ver dónde están los archivos.
            print(f"✅ Formularios generados para {muni_display} ({mun_code}) en la carpeta 'formularios':")
            print(f"  - {os.path.basename(path_agua)}")
            print(f"  - {os.path.basename(path_obras)}")
            print(f"  - {os.path.basename(path_residuos)}")
            print(f"  - {os.path.basename(path_cementerios)}") 

    except ConnectionError as e:
        print(f"❌ FATAL ERROR: {e}")
        print("\nDIAGNÓSTICO: Por favor, compruebe el servidor de PostgreSQL y las credenciales de la BD.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ FATAL ERROR: Error inesperado en el script principal: {e}")
    finally:
        if conn:
            conn.close()
            print("\n--- PROCESO FINALIZADO ---")

if __name__ == '__main__':
    main()