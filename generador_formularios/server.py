from flask import Flask, request, jsonify
import psycopg2
import psycopg2.extras

app = Flask(__name__)

def conectar():
    return psycopg2.connect(
        host="XXXXX",
        database="XXX",
        user="XXXX",
        password="XXXX",
        port="5432"
    )

@app.route("/api/depositos")
def get_depositos():
    muni = request.args.get("mun")
    
    conn = conectar()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("""
        SELECT d.mun, d.orden_depo, d.nombre, de.limpieza 
        FROM deposito d
        LEFT JOIN deposito_enc de using (fase, mun, orden_depo)
        WHERE fase = (select max(fase) from geonet_fase) and d.mun = %s
        ORDER BY orden_depo;
    """, (muni,))
    
    rows = cur.fetchall()
    cur.close()
    conn.close()
    
    return jsonify([dict(row) for row in rows])

if __name__ == "__main__":
    app.run(debug=True)
