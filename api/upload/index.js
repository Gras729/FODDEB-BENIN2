/**
 * FODDEB — api/upload/index.js
 * Route Vercel : /api/upload
 * Gère les uploads vers Supabase Storage (remplace Google Drive).
 *
 * POST multipart/form-data
 * Champs : file (binaire) · bucket · path
 * Header : Authorization Bearer <token>
 *
 * Buckets configurés dans Supabase Storage :
 *   - membres-photos      (photos profil)
 *   - membres-documents   (CNI, récépissé, signature)
 *   - projets-images      (images couverture)
 *   - projets-fichiers    (documents joints)
 *   - rapports            (fichiers rapport)
 *   - actualites-images   (images articles)
 */

import { IncomingForm }              from 'formidable';
import fs                            from 'fs';
import path                          from 'path';
import { supabase, ok, err, authGuard } from '../../lib/supabase.js';

// Désactiver le bodyParser Vercel — on gère le multipart manuellement
export const config = { api: { bodyParser: false } };

// Buckets autorisés et taille max par bucket (en octets)
const BUCKETS = {
  'membres-photos':    { maxSize: 2 * 1024 * 1024,  types: ['image/jpeg', 'image/png', 'image/webp'] },
  'membres-documents': { maxSize: 5 * 1024 * 1024,  types: ['image/jpeg', 'image/png', 'application/pdf'] },
  'projets-images':    { maxSize: 3 * 1024 * 1024,  types: ['image/jpeg', 'image/png', 'image/webp'] },
  'projets-fichiers':  { maxSize: 10 * 1024 * 1024, types: ['application/pdf', 'application/msword',
                           'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  'rapports':          { maxSize: 20 * 1024 * 1024, types: ['application/pdf'] },
  'actualites-images': { maxSize: 3 * 1024 * 1024,  types: ['image/jpeg', 'image/png', 'image/webp'] },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Méthode non autorisée', 405);

  // Authentification obligatoire
  const membre = await authGuard(req);
  if (!membre) return err(res, 'Non authentifié.', 401);

  // Parse multipart
  const form = new IncomingForm({ maxFileSize: 25 * 1024 * 1024, keepExtensions: true });

  form.parse(req, async (parseErr, fields, files) => {
    if (parseErr) return err(res, 'Erreur parsing fichier : ' + parseErr.message);

    try {
      const bucket   = String(fields.bucket?.[0] || fields.bucket || '');
      const filePath = String(fields.path?.[0]   || fields.path   || '');
      const file     = files.file?.[0] || files.file;

      if (!bucket || !filePath || !file)
        return err(res, 'Champs requis : bucket, path, file.');

      if (!BUCKETS[bucket])
        return err(res, `Bucket non autorisé : ${bucket}.`);

      const { maxSize, types } = BUCKETS[bucket];
      const mimeType = file.mimetype || '';

      if (!types.includes(mimeType))
        return err(res, `Type de fichier non accepté. Types autorisés : ${types.join(', ')}`);

      if (file.size > maxSize)
        return err(res, `Fichier trop volumineux (max ${Math.round(maxSize / 1024 / 1024)} Mo).`);

      const fileBuffer = fs.readFileSync(file.filepath);
      const ext        = path.extname(file.originalFilename || '').toLowerCase();
      const storagePath = `${filePath}${ext}`;

      // Upload vers Supabase Storage
      const { data, error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, fileBuffer, {
          contentType:  mimeType,
          upsert:       true,           // remplace si existant (ex. mise à jour photo)
        });

      if (uploadErr) return err(res, 'Erreur upload : ' + uploadErr.message);

      // Générer l'URL publique
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);

      return ok(res, {
        url:  urlData.publicUrl,
        path: storagePath,
        bucket,
        size: file.size,
      });

    } catch (e) {
      console.error('[upload]', e.message);
      return err(res, 'Erreur interne upload.', 500);
    }
  });
}
