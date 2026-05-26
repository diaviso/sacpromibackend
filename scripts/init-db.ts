/**
 * Crée la base de données configurée dans DATABASE_URL si elle n'existe pas.
 * Utilise prisma db execute via une URL pointant sur la base "postgres" par défaut.
 *
 * Usage : ts-node scripts/init-db.ts
 *
 * Ne nécessite ni psql ni Docker — juste un PostgreSQL accessible sur le réseau.
 */

import { execSync } from 'child_process';
import { config } from 'dotenv';
import * as path from 'path';
import { Client } from 'pg';

config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL manquant dans .env');
    process.exit(1);
  }

  // Parse l'URL pour en extraire le nom de la base + reconstruire une URL
  // pointant sur la base "postgres" (toujours présente par défaut).
  const url = new URL(databaseUrl);
  const targetDb = url.pathname.replace(/^\//, '').replace(/\?.*$/, '');
  if (!targetDb) {
    console.error('❌ Aucun nom de base trouvé dans DATABASE_URL');
    process.exit(1);
  }

  // URL "admin" : même host/user/pass mais base = postgres
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  // On enlève les options de schéma qui ne s'appliquent pas
  adminUrl.searchParams.delete('schema');

  const client = new Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    console.error(`❌ Impossible de se connecter à PostgreSQL sur ${url.host} : ${(err as Error).message}`);
    console.error('   Vérifiez que PostgreSQL est démarré et que DATABASE_URL est correct.');
    process.exit(1);
  }

  try {
    const res = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists`,
      [targetDb],
    );
    if (res.rows[0]?.exists) {
      console.log(`✅ Base "${targetDb}" déjà existante — rien à faire.`);
    } else {
      // CREATE DATABASE ne supporte pas les paramètres préparés, on doit
      // échapper le nom à la main. On accepte uniquement [a-zA-Z0-9_-].
      if (!/^[a-zA-Z0-9_-]+$/.test(targetDb)) {
        console.error(`❌ Nom de base invalide : "${targetDb}"`);
        process.exit(1);
      }
      await client.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`✅ Base "${targetDb}" créée.`);
    }
  } finally {
    await client.end();
  }

  // Applique les migrations
  console.log('🔄 Application des migrations Prisma...');
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  } catch {
    // Si migrate deploy échoue (typiquement parce qu'aucune migration n'existe
    // encore ou qu'on est sur un schéma posé via db push), on retombe sur db push
    // pour synchroniser le schéma.
    console.log('   → migrate deploy a échoué, fallback sur prisma db push...');
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  }

  // Génère le client
  console.log('🔧 Génération du client Prisma...');
  execSync('npx prisma generate', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });

  console.log('✅ Base prête. Vous pouvez maintenant lancer "npm run seed" puis "npm run start:dev".');
}

main().catch((err) => {
  console.error('❌ Erreur init-db :', err);
  process.exit(1);
});
