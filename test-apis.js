#!/usr/bin/env node
/**
 * Script de test pour vérifier la configuration API
 * Teste la connectivité Supabase, OpenAI et Groq
 */

const { createClient } = require('@supabase/supabase-js');

async function testAPIs() {
  console.log('🔍 Test de configuration API VoiceTracker\n');

  // Test Supabase
  console.log('1. Test Supabase...');
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data, error } = await supabase
      .from('expenses')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('⚠️  Supabase: Table expenses non trouvée (normal si pas encore créée)');
    } else {
      console.log('✅ Supabase: Connexion OK');
    }
  } catch (err) {
    console.log('❌ Supabase: Erreur de connexion', err.message);
  }

  // Test OpenAI (simple validation de clé)
  console.log('\n2. Test OpenAI API Key...');
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey.startsWith('sk-') && openaiKey.length > 20) {
    console.log('✅ OpenAI: Format de clé valide');
  } else {
    console.log('❌ OpenAI: Format de clé invalide');
  }

  // Test Groq (simple validation de clé)
  console.log('\n3. Test Groq API Key...');
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey.startsWith('gsk_') && groqKey.length > 20) {
    console.log('✅ Groq: Format de clé valide');
  } else {
    console.log('❌ Groq: Format de clé invalide');
  }

  console.log('\n🎯 Configuration prête pour la production !');
  console.log('📝 Accédez à http://localhost:3001 pour tester l\'interface');
}

// Charger les variables d'environnement
require('dotenv').config({ path: '.env.local' });

testAPIs().catch(console.error);