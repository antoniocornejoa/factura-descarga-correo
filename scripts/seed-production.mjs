import pg from "pg";

export async function seedProductionDB() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("[seed] No DATABASE_URL, skipping seed");
    return;
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? undefined
      : { rejectUnauthorized: false },
  });

  try {
    const check = await pool.query("SELECT count(*) as total FROM cost_centers");
    if (parseInt(check.rows[0].total) > 0) {
      console.log(`[seed] cost_centers already has ${check.rows[0].total} rows, skipping seed`);
      await pool.end();
      return;
    }

    console.log("[seed] Production DB empty, seeding data...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cost_centers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS responsables (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cost_center_responsables (
        id SERIAL PRIMARY KEY,
        responsable_id INTEGER REFERENCES responsables(id),
        center_name TEXT NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_snapshots (
        id SERIAL PRIMARY KEY,
        snapshot_date DATE NOT NULL,
        center_name TEXT NOT NULL,
        pending_count INTEGER NOT NULL DEFAULT 0,
        pending_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const costCenters = [
      ["(ADM) OFICINA CENTRAL", false],
      ["(AERO) OFICINA CENTRAL", false],
      ["(CISPA) BODEGA CONTROL DE EXCEDENTES", true],
      ["(CISPA) CURICO - PARQUE BELLAVISTA III DS01 ETAPA 2 119 VIV", true],
      ["(CISPA) CURICO PARQUE BELLAVISTA III ETAPA 3 30 VIV (DS01)", true],
      ["(CISPA) MOLINA - PARQUE DEL SOL III 52 VIV. (DS01)", true],
      ["(CISPA) MOLINA PARQUE DEL SOL 25", true],
      ["(CISPA) OFICINA CENTRAL", false],
      ["(CISPA) OFICINA MARKETING", false],
      ["(CISPA) PROYECTOS EN DESARROLLO", false],
      ["(CISPA) PVTA CURICO - PARQUE BELLAVISTA III (ETAPA 1) 44 VIV (DS01)", true],
      ["(CISPA) PVTA CURICO PARQUE BELLAVISTA 114 VIV", true],
      ["(CISPA) PVTA MOLINA - PARQUE DEL SOL I 25 VIV (DS01)", true],
      ["(CISPA) TALCA - BICENTENARIO DS01 X 26 VIV.", true],
      ["(CISPA) TALCA PARQUE BICENTENARIO III ET 4 110 VIV (DS01)", true],
      ["(COLB)  PVTA CURICO HACIENDA EL BOLDO LOTE A 144 VIV.", true],
      ["(COLB)  PVTA MOLINA PDS 96 VIV DS01", true],
      ["(COLB)  PVTA TALCA SAN VALENTÍN 96 VIV.", true],
      ["(COLB) AGRICOLA LEICE", false],
      ["(COLB) COLBUN - MIRADOR DE LA PONDEROSA I 59 LT", true],
      ["(COLB) IMPOSICIONES Y FINIQUITOS SUBCONTRATOS", true],
      ["(COLB) OFICINA CENTRAL", false],
      ["(COLB) PROYECTOS EN DESARROLLO", false],
      ["(COLB) PVTA CURICO - PARQUE DEL SOL II - III - 88 VIV.", true],
      ["(COLB) PVTA PROYECTOS TALCA EDIFICIOS HACIENDA ESMERALDA", true],
      ["(COLB) PVTA PROYECTOS TALCA VALLES DEL COUNTRY", true],
      ["(COLB) PVTA TALCA - ED PLAZA INDEPENDENCIA III", true],
      ["(COLB) PVTA TALCA - HACIENDA ESMERALDA 37 VIV", true],
      ["(COLB) TALCA - CLUB HOUSE TERRENO BIANCHI", true],
      ["(COLB) TALCA - CONDOMINIO HACIENDA ESMERALDA III-B  33 VIV.", true],
      ["(COLB) TALCA - CONDOMINIO HACIENDA ESMERALDA III-C 44 VIV", true],
      ["(COLB) TALCA - CONDOMINIO PARQUE SAN VALENTIN VI ET. I 48 VIV.", true],
      ["(COLB) TALCA - CONDOMINIO PARQUE SAN VALENTIN VI ET. III 38 VIV", true],
      ["(COLB) TALCA - EDIFICIO HACIENDA LA ESMERALDA IV 87 DEPTOS", true],
      ["(COLB) TALCA - PARQUE ESMERALDA URBANIZACION SEPULVEDA", true],
      ["(COLB) TALCA - PARQUE SAN VALENTIN V 61 VIV", true],
      ["(COLB) TALCA - PARQUE SAN VALENTIN V 71 VIV", true],
      ["(COLB) TALCA - PARQUE SAN VALENTÍN 6 VIV", true],
      ["(COLB) TALCA - PASEO HACIENDA ETAPA 1 166", true],
      ["(COLB) TALCA - PASEO HACIENDA II", true],
      ["(COLB) TALCA - VILLA HACIENDA ESMERALDA SUR 8 VIV.", true],
      ["(COLB) TALCA BICENTENARIO X 76 VIV DS01", true],
      ["(COLB) TALCA EDIFICIO HACIENDA ESMERALDA III 69", true],
      ["(COLB) TALCA HABILITACIÓN OFICINA PISO 9 CLR I", false],
      ["(CRIO) CURICO -  EDIFICIO DON SEBASTIÁN DE RAUQUEN 126 DEPTOS. (DS19)", true],
      ["(CRIO) CURICO - PARQUE BELLAVISTA IV 284 VIV (DS49)", true],
      ["(CRIO) IMPOSICIONES Y FINIQUITOS SUBCONTRATOS", true],
      ["(CRIO) LINARES EDIFICIO PARQUE DEL SOL V DSN°49 120 DEPTOS", true],
      ["(CRIO) LINARES PARQUE DEL SOL 114 VIV", true],
      ["(CRIO) LINARES PARQUE DEL SOL III/IV DSN°49 436 VIV", true],
      ["(CRIO) MOLINA - DON SEBASTIAN DE LONTUE 43 VIV (DS49)", true],
      ["(CRIO) MOLINA - PARQUE DEL SOL III/IV 611 VIV.", true],
      ["(CRIO) MOLINA - PDS II 180 VIV 1 LC (DS19)", true],
      ["(CRIO) OFICINA CENTRAL", false],
      ["(CRIO) PENCAHUE - BRISAS DE PENCAHUE 199 V. (DS49)", true],
      ["(CRIO) PROYECTOS EN DESARROLLO", false],
      ["(CRIO) PVTA  BRISAS DE PENCAHUE II 284 VIV", false],
      ["(CRIO) PVTA LINARES - PARQUE DEL SOL III-IV 436 VIV (DS49)", true],
      ["(CRIO) PVTA LINARES EDIFICIO PARQUE DEL SOL V 120 VIV (DS49)", true],
      ["(CRIO) PVTA MOLINA - PARQUE DEL SOL II 180 VIV (DS19)  1 LC", true],
      ["(CRIO) PVTA MOLINA - PARQUE DEL SOL III-IV 611 VIV (DS49)", true],
      ["(CRIO) PVTA PROYECTOS LINARES", true],
      ["(CRIO) PVTA PROYECTOS SAN JAVIER", true],
      ["(CRIO) PVTA PROYECTOS TALCA BICENTENARIOS", true],
      ["(CRIO) PVTA SAN JAVIER - BICENTENARIO VII 130 VIV.", true],
      ["(CRIO) PVTA TALCA - ED. PUERTAS DE LIRCAY I", true],
      ["(CRIO) RETIRO - BRISAS DE RETIRO (DS N°49) 159 VIV", true],
      ["(CRIO) SAN JAVIER - BRISAS DE LONCOMILLA 525 V", true],
      ["(CRIO) TALCA -  BATALLA DE LIRCAY II ETAPA 1 296 VIV. (DS19)", true],
      ["(CRIO) TALCA - BICENTENARIO DE LIRCAY IV (OLAVE) 240 VIV. (DS49)", true],
      ["(CRIO) TALCA - PUERTAS DE LIRCAY I 160 DEPTOS (DS49)", true],
      ["(CRIO) TALCA - RIBERAS DEL CLARO II 320 VIV (DS49)", true],
      ["(CRIO) TALCA BICENTENARIO BATALLA DE LIRCAY 298 VIVIENDAS 2 L.C.", true],
      ["(CRIO) TALCA ED. DON RICARDO DS49 70 DEPTOS. DS49", true],
      ["(CRIO) TALCA ED. VALLES SAN VALENTIN DS19 160 DPTOS", true],
      ["(CRIO) TALCA EDIFICIO VALLES SAN VALENTÍN II 139 DEPTOS  14 LC. (DS19)", true],
      ["(CRIO) TALCA PARQUE BICENTENARIO IV DS19 238 VIV.", true],
      ["(CRIO) TALCA PUERTAS DE LIRCAY II 160", true],
      ["(CRIO) VILLA ALEGRE DON JAIME 140 VIV", true],
      ["(IEHE) OFICINA CENTRAL", false],
      ["(INMH) OFICINA CENTRAL", false],
      ["(INMH) OFICINA MARKETING", false],
      ["(INMS) OFICINA CENTRAL", false],
      ["(INMS) OFICINA MARKETING", false],
      ["(INPH) INMOB TALCA - PASEO HACIENDA I", false],
      ["(INV) OFICINA CENTRAL", false],
      ["(INV) PROYECTOS EN DESARROLLO", false],
      ["(RNTS) OFICINA CENTRAL", false],
      ["DOCUMENTOS EXCLUIDOS", false],
    ];

    for (const [name, active] of costCenters) {
      await pool.query("INSERT INTO cost_centers (name, active) VALUES ($1, $2)", [name, active]);
    }
    console.log(`[seed] Inserted ${costCenters.length} cost centers`);

    const responsables = [
      [1, "Jose Martin Mardones Rojas", "jose.mardones@cindependencia.cl"],
      [2, "Natalia Bravo Troncoso", "natalia.bravo@cindependencia.cl"],
      [3, "Angelina Fernanda Valedes Muñoz", "afvaldes@cindependencia.cl"],
      [4, "Mike Francisco Ramirez Muñoz", "mramirez@cindependencia.cl"],
      [5, "Marcela Nicol Moreno Vergara", "marcela.moreno@cindependencia.cl"],
      [6, "Rodolfo Segundo Reyes Fuenzalida", "rodolfo.reyes@cindependencia.cl"],
      [7, "Yeila Alexandra Huichaqueo Fuentes", "yeila.huichaqueo@cindependencia.cl"],
      [8, "Fabian Andres Sepulveda Iceta", "fsepulveda@cindependencia.cl"],
      [9, "Mario Antonio Bravo Toledo", "mario.bravo@cindependencia.cl"],
      [10, "Francisco Javier Saez Caceres", "francisco.saez@cindependencia.cl"],
      [11, "Francisco Antonio Urra Urquiola", "francisco.urra@cindependencia.cl"],
      [12, "Marcelo Martin Alruiz Villar", "malruiz@cindependencia.cl"],
      [13, "Escarlet Rojas Inostroza", "escarlet.rojas@cindependencia.cl"],
      [14, "Ivan Gonzalo Loncon Guala", "iloncon@cindependencia.cl"],
      [15, "Carlos Ignacio Villaroel Miranda", "cvillarroel@cindependencia.cl"],
      [16, "Marcelo Eugenio Bascuñan Lara", "mbascunan@cindependencia.cl"],
      [17, "Nicolas Torres Molina", "nicolas.torres@cindependencia.cl"],
      [18, "Alfonso Gonzalez Ramirez", "alfonso.gonzalez@cindependencia.cl"],
    ];

    for (const [id, name, email] of responsables) {
      await pool.query("INSERT INTO responsables (id, name, email) VALUES ($1, $2, $3)", [id, name, email]);
    }
    await pool.query("SELECT setval('responsables_id_seq', (SELECT MAX(id) FROM responsables))");
    console.log(`[seed] Inserted ${responsables.length} responsables`);

    const ccr = [
      [1, "(CISPA) CURICO - PARQUE BELLAVISTA III DS01 ETAPA 2 119 VIV"],
      [1, "(CISPA) CURICO PARQUE BELLAVISTA III ETAPA 3 30 VIV (DS01)"],
      [1, "(CISPA) MOLINA - PARQUE DEL SOL III 52 VIV. (DS01)"],
      [1, "(CISPA) MOLINA PARQUE DEL SOL 25"],
      [1, "(CRIO) CURICO - EDIFICIO DON SEBASTIÁN DE RAUQUEN 126 DEPTOS. (DS19)"],
      [1, "(CRIO) MOLINA - DON SEBASTIAN DE LONTUE 43 VIV (DS49)"],
      [2, "(CISPA) IMPOSICIONES Y FINIQUITOS SUBCONTRATOS"],
      [2, "(COLB) IMPOSICIONES Y FINIQUITOS SUBCONTRATOS"],
      [2, "(CRIO) IMPOSICIONES Y FINIQUITOS SUBCONTRATOS"],
      [3, "(CISPA) CAUQUENES PARQUE DEL SOL 129 VIV"],
      [3, "(CISPA) PVTA BICENTENARIO NORTE 115 VIV"],
      [3, "(CISPA) PVTA CURICO - PARQUE BELLAVISTA III (ETAPA 1) 44 VIV (DS01)"],
      [3, "(CISPA) PVTA CURICO - PARQUE BELLAVISTA III (ETAPA 2) 119 VIV (DS01)"],
      [3, "(CISPA) PVTA CURICO PARQUE BELLAVISTA 114 VIV"],
      [3, "(CISPA) PVTA CURICO PARQUE DEL SOL 141 VIV 31 DEPTOS"],
      [3, "(CISPA) PVTA LINARES PARQUE DEL SOL 47 VIV"],
      [3, "(CISPA) PVTA MOLINA - PARQUE DEL SOL I 25 VIV (DS01)"],
      [3, "(CISPA) PVTA PROYECTOS CONSTITUCION PARQUE DEL SOL"],
      [3, "(COLB) PVTA CURICO - PARQUE DEL SOL II - III - 88 VIV."],
      [3, "(COLB) PVTA CURICO HACIENDA EL BOLDO LOTE A 144 VIV."],
      [3, "(COLB) PVTA MOLINA PDS 96 VIV DS01"],
      [3, "(COLB) PVTA PROYECTOS CURICO HACIENDA EL BOLDO"],
      [3, "(COLB) PVTA PROYECTOS CURICO VALLES Y VIÑEDOS DEL BOLDO"],
      [3, "(COLB) PVTA PROYECTOS TALCA ALTOS DEL COUNTRY"],
      [3, "(COLB) PVTA PROYECTOS TALCA CENTRO LAS RASTRAS"],
      [3, "(COLB) PVTA PROYECTOS TALCA EDIFICIOS HACIENDA ESMERALDA"],
      [3, "(COLB) PVTA PROYECTOS TALCA VALLES DEL COUNTRY"],
      [3, "(COLB) PVTA TALCA - BICENTENARIO X 76 VIV (DS01)"],
      [3, "(COLB) PVTA TALCA - ED PLAZA INDEPENDENCIA III"],
      [3, "(COLB) PVTA TALCA - HACIENDA ESMERALDA 37 VIV"],
      [3, "(COLB) PVTA TALCA - HACIENDA ESMERALDA III-B COND. 33 VIV."],
      [3, "(COLB) PVTA TALCA - PARQUE SAN VALENTIN V 71 VIV"],
      [3, "(COLB) PVTA TALCA BICENTENARIO LIRCAY IV- V 186 VIV"],
      [3, "(COLB) PVTA TALCA CENTRO LAS RASTRAS III"],
      [3, "(COLB) PVTA TALCA EDIFICIO MIRADOR DEL COUNTRY 66 DEPTOS"],
      [3, "(COLB) PVTA TALCA SAN VALENTÍN 113 VIV."],
      [3, "(COLB) PVTA TALCA SAN VALENTÍN 125 VIV."],
      [3, "(COLB) PVTA TALCA SAN VALENTÍN 96 VIV."],
      [3, "(CRIO) - PVTA RIBERAS DEL CLARO 143 VIV"],
      [3, "(CRIO) PV BRISAS DE PENCACHUE I 153 VIV"],
      [3, "(CRIO) PVTA - BRISAS DEL MAULE 245 VIV"],
      [3, "(CRIO) PVTA BRISAS DE PENCAHUE II 284 VIV"],
      [3, "(CRIO) PVTA CAUQUENES - PDS III 268 VIV DS49"],
      [3, "(CRIO) PVTA LINARES - PARQUE DEL SOL 114 VIV (DS19)"],
      [3, "(CRIO) PVTA LINARES - PARQUE DEL SOL III-IV 436 VIV (DS49)"],
      [3, "(CRIO) PVTA LINARES EDIFICIO PARQUE DEL SOL V 120 VIV (DS49)"],
      [3, "(CRIO) PVTA LINARES PDS 137 VIV."],
      [3, "(CRIO) PVTA LINARES PDS 318 VIV"],
      [3, "(CRIO) PVTA MOLINA - DON SEBASTIAN DE LONTUE 43 VIV (DS49)"],
      [3, "(CRIO) PVTA MOLINA - PARQUE DEL SOL II 180 VIV (DS19) 1 LC"],
      [3, "(CRIO) PVTA MOLINA - PARQUE DEL SOL III-IV 611 VIV (DS49)"],
      [3, "(CRIO) PVTA PARQUE RIBERAS DE LIRCAY II Y IV 323 VIV"],
      [3, "(CRIO) PVTA PROYECTOS CAUQUENES"],
      [3, "(CRIO) PVTA PROYECTOS CURICO DON SEBASTIAN DE RAUQUEN"],
      [3, "(CRIO) PVTA PROYECTOS LINARES"],
      [3, "(CRIO) PVTA PROYECTOS MOLINA / ROMERAL / SAN RAFAEL"],
      [3, "(CRIO) PVTA PROYECTOS SAN JAVIER"],
      [3, "(CRIO) PVTA PROYECTOS TALCA BICENTENARIOS"],
      [3, "(CRIO) PVTA PROYECTOS TALCA PONIENTE"],
      [3, "(CRIO) PVTA PROYECTOS TALCA SOCIALES"],
      [3, "(CRIO) PVTA RETIRO - BRISAS DE RETIRO 159 VIV (DS49)"],
      [3, "(CRIO) PVTA SAN JAVIER - BICENTENARIO VII 130 VIV."],
      [3, "(CRIO) PVTA SAN JAVIER PDS 209"],
      [3, "(CRIO) PVTA SAN RAFAEL - BICENTENARIO II C - 135 VIV."],
      [3, "(CRIO) PVTA TALCA - BRISAS DE LAS RASTRAS 128 VIV (DS19)"],
      [3, "(CRIO) PVTA TALCA - ED. PUERTAS DE LIRCAY I"],
      [3, "(CRIO) PVTA TALCA - EDIFICIO DON RICARDO 70 VIV (DS49)"],
      [3, "(CRIO) PVTA TALCA - PARQUE BICENTENARIO III 300 VIV (DS19)"],
      [3, "(CRIO) PVTA TALCA - VALLES SAN VALENTIN 160 VIV (DS19)"],
      [3, "(CRIO) PVTA VILLA ALEGRE - DON JAIME II 111 VIV (DS49)"],
      [4, "(CISPA) TALCA - BICENTENARIO DS01 X 26 VIV."],
      [4, "(CISPA) TALCA PARQUE DEL COUNTRY 28 VIV (DS01)"],
      [5, "(CISPA) TALCA - BICENTENARIO LIRCAY IV 76 VIV (DS01)"],
      [5, "(CISPA) TALCA - BICENTENARIO ZAROR 41 VIV DS01"],
      [5, "(CISPA) TALCA - OBRAS DE CANALIZACION"],
      [5, "(CISPA) TALCA - PARQUE BICENTENARIO III URBANIZACION"],
      [5, "(CISPA) TALCA PARQUE BICENTENARIO III ET 4 110 VIV (DS01)"],
      [5, "(CISPA) URBANIZACIÓN DE TERRENO ZAROR - BIC XIII"],
      [5, "(COLB) TALCA BICENTENARIO X 76 VIV DS01"],
      [5, "(CRIO) TALCA ED. VALLES SAN VALENTIN DS19 160 DPTOS"],
      [6, "(COLB) TALCA - CLUB HOUSE TERRENO BIANCHI"],
      [6, "(COLB) TALCA - PARQUE ESMERALDA URBANIZACION SEPULVEDA"],
      [6, "(CRIO) RETIRO - BRISAS DE RETIRO (DS N°49) 159 VIV"],
      [7, "(COLB) TALCA - CONDOMINIO HACIENDA ESMERALDA III-B 33 VIV."],
      [7, "(COLB) TALCA - CONDOMINIO HACIENDA ESMERALDA III-C 44 VIV"],
      [8, "(COLB) TALCA - CONDOMINIO PARQUE SAN VALENTIN VI ET. I 48 VIV."],
      [8, "(COLB) TALCA - CONDOMINIO PARQUE SAN VALENTIN VI ET. III 38 VIV"],
      [8, "(COLB) TALCA - PARCELAS SAN VALENTIN 5 VIV."],
      [8, "(COLB) TALCA - PARQUE SAN VALENTIN V 61 VIV"],
      [8, "(COLB) TALCA - PARQUE SAN VALENTIN V 71 VIV"],
      [8, "(COLB) TALCA - PARQUE SAN VALENTÍN 6 VIV"],
      [9, "(COLB) TALCA - EDIFICIO HACIENDA LA ESMERALDA IV 87 DEPTOS"],
      [9, "(CRIO) LINARES EDIFICIO PARQUE DEL SOL V DSN°49 120 DEPTOS"],
      [10, "(COLB) TALCA - PASEO HACIENDA ETAPA 1 166"],
      [10, "(COLB) TALCA - PASEO HACIENDA II"],
      [10, "(CRIO) TALCA – BRISA DE LAS RASTRAS 128 DEPTOS (DS19)"],
      [11, "(COLB) COLBUN - MIRADOR DE LA PONDEROSA I 59 LT"],
      [11, "(COLB) SAN CLEMENTE - BOSQUES DE LIRCAY III 21 SITIOS"],
      [11, "(COLB) TALCA - VILLA HACIENDA ESMERALDA SUR 8 VIV."],
      [12, "(COLB) TALCA EDIFICIO HACIENDA ESMERALDA III 69"],
      [13, "(CRIO) CURICO - PARQUE BELLAVISTA IV 284 VIV (DS49)"],
      [13, "(CRIO) MOLINA - PARQUE DEL SOL III/IV 611 VIV."],
      [13, "(CRIO) MOLINA - PDS II 180 VIV 1 LC (DS19)"],
      [13, "(CRIO) TALCA - BATALLA DE LIRCAY II ETAPA 1 296 VIV. (DS19)"],
      [14, "(CRIO) LINARES PARQUE DEL SOL 114 VIV"],
      [14, "(CRIO) LINARES PARQUE DEL SOL III/IV DSN°49 436 VIV"],
      [14, "(CRIO) SAN JAVIER - BRISAS DE LONCOMILLA 525 V"],
      [15, "(CRIO) TALCA - PUERTAS DE LIRCAY I 160 DEPTOS (DS49)"],
      [15, "(CRIO) TALCA PUERTAS DE LIRCAY II 160"],
      [15, "(CRIO) VILLA ALEGRE DON JAIME 140 VIV"],
      [16, "(CRIO) TALCA BICENTENARIO BATALLA DE LIRCAY 298 VIVIENDAS 2 L.C."],
      [16, "(CRIO) TALCA PARQUE BICENTENARIO IV DS19 238 VIV."],
      [17, "(CRIO) TALCA ED. DON RICARDO DS49 70 DEPTOS. DS49"],
      [18, "(CISPA) TALCA - TERRENO ROL 03709-00333 - LOTE 2 FUSIONADO OPERACION COLEGIO LAS RASTRAS"],
      [18, "(CRIO) TALCA EDIFICIO VALLES SAN VALENTÍN II 139 DEPTOS 14 LC. (DS19)"],
    ];

    for (const [respId, centerName] of ccr) {
      await pool.query("INSERT INTO cost_center_responsables (responsable_id, center_name) VALUES ($1, $2)", [respId, centerName]);
    }
    console.log(`[seed] Inserted ${ccr.length} cost_center_responsables`);

    console.log("[seed] Production DB seeded successfully!");
  } catch (err) {
    console.error("[seed] Error seeding production DB:", err.message);
  } finally {
    await pool.end();
  }
}
