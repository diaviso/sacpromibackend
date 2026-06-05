import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  process.env.TZ = process.env.TZ || 'Africa/Dakar';

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix('api');

  // Derrière un reverse proxy (Railway / Render / Heroku) — nécessaire pour
  // que les IPs réelles soient utilisées par le rate limiter et que les cookies
  // secure fonctionnent.
  app.set('trust proxy', 1);

  // Sécurité HTTP : Helmet
  app.use(
    helmet({
      // CSP désactivée en dev pour Swagger UI ; en prod on active
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS — accepte un ou plusieurs origins séparés par virgule.
  // Ex: CORS_ORIGIN="https://sacpromi.vercel.app,https://app.sacpromi.sn"
  const corsRaw = config.get<string>('CORS_ORIGIN', 'http://localhost:3071');
  const allowedOrigins = corsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      // origin === undefined pour curl/Postman/server-to-server — on autorise
      if (!origin) return callback(null, true);
      // Wildcard pour les preview deployments Vercel
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Autoriser tous les sous-domaines vercel.app si demandé
      if (allowedOrigins.some((o) => o === 'vercel.app') && origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} non autorisé`));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // HttpExceptionFilter est enregistre comme APP_FILTER dans AppModule
  // pour beneficier de l'injection AuditService.
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger : exposé en dev par défaut, désactivable en prod via SWAGGER_ENABLED=false
  const swaggerEnabled =
    config.get<string>('SWAGGER_ENABLED', isProd ? 'false' : 'true') === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SACPROMI API')
      .setDescription(
        "API de gestion intégrée SACPROMI — production d'aliments pour animaux et élevage de poulets de chair",
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'JWT-auth',
      )
      .addTag('Health', 'Liveness + DB check (public)')
      .addTag('Auth', 'Authentification et gestion de session')
      .addTag('Users', 'Gestion des utilisateurs')
      .addTag('Suppliers', 'Gestion des fournisseurs')
      .addTag('Purchase Orders', 'Bons de commande fournisseurs')
      .addTag('Purchase Invoices', "Factures d'achat")
      .addTag('Supplier Payments', 'Paiements fournisseurs')
      .addTag('Raw Materials', 'Matières premières (catalogue, lots, mouvements)')
      .addTag('Inventory', 'Inventaires physiques')
      .addTag('Conservation Costs', 'Coûts de conservation par période')
      .addTag('Finished Products', 'Produits finis (aliments, poulets) — catalogue, lots, stock')
      .addTag('Formulas', 'Formules de fabrication (recettes)')
      .addTag('Production', 'Ordres de production et coût de revient')
      .addTag('Breeding', "Bandes d'élevage de poulets de chair")
      .addTag('Customers', 'Clients et statistiques')
      .addTag('Customer Orders', 'Commandes clients')
      .addTag('Sales', 'Factures de vente / Reçus + PDF + email')
      .addTag('Customer Payments', 'Paiements clients')
      .addTag('Expenses', 'Dépenses, charges et catégories')
      .addTag('Reports', 'Rapports et analyses')
      .addTag('Settings', 'Paramètres + export CSV')
      .addTag('Dashboard', 'Tableau de bord et indicateurs')
      // Sprint 7 — Finance & Trésorerie
      .addTag('Accounts', 'Comptes de trésorerie (caisse, banque, mobile money)')
      .addTag('Treasury', 'Grand livre, transferts inter-comptes, dashboard financier')
      .addTag('Loans', 'Prêts bancaires, échéancier, remboursements')
      .addTag('Fixed Assets', 'Immobilisations + dotations aux amortissements')
      .addTag('Capital Movements', 'Apports, retraits, subventions, dons, dividendes')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Railway / Heroku / Render fournissent PORT dans l'env
  const port = parseInt(config.get<string>('PORT', '3070'), 10);
  // Bind sur 0.0.0.0 pour être joignable depuis l'extérieur du conteneur
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 SACPROMI API démarrée sur le port ${port}`);
  if (swaggerEnabled) logger.log(`📚 Swagger : /api/docs`);
  logger.log(`🌍 CORS origins : ${allowedOrigins.join(', ')}`);
  logger.log(`🔒 Mode : ${isProd ? 'production' : 'development'}`);
}

bootstrap();
