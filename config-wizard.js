#!/usr/bin/env bun

/**
 * Bobby Bot Configuration Wizard
 * Securely collects and stores user credentials for Bobby
 */

import { prompt } from 'bun:prompt';
import { write } from 'bun';
import { randomBytes, createCipheriv } from 'crypto';
import { writeFileSync } from 'fs';

async function configWizard() {
  console.log('=== Bobby Bot Configuration Wizard ===');
  console.log('This wizard will collect and securely store your API keys and tokens.\n');
  
  // Get encryption password
  const password = await prompt('Enter a secure password to encrypt your configuration:', { password: true });
  
  if (password.length < 8) {
    console.error('Password must be at least 8 characters long. Please try again.');
    process.exit(1);
  }
  
  // Collect credentials
  console.log('\n=== Discord Configuration ===');
  console.log('Create a Discord bot at https://discord.com/developers/applications');
  const discordToken = await prompt('Enter your Discord Bot Token:');
  
  console.log('\n=== Anthropic Configuration ===');
  console.log('Get your API key from https://www.anthropic.com');
  const anthropicKey = await prompt('Enter your Anthropic API Key:');
  
  console.log('\n=== GitHub Configuration ===');
  console.log('Create a Personal Access Token at https://github.com/settings/tokens');
  const ghToken = await prompt('Enter your GitHub Personal Access Token:');
  const githubRepo = await prompt('Enter your GitHub Repository (owner/repo-name):');
  
  // Create configuration object
  const config = {
    DISCORD_TOKEN: discordToken,
    ANTHROPIC_API_KEY: anthropicKey,
    GH_TOKEN: ghToken,
    GITHUB_REPO: githubRepo
  };
  
  // Create .env file (unencrypted) for development
  let envContent = '';
  for (const [key, value] of Object.entries(config)) {
    envContent += `${key}=${value}\n`;
  }
  
  try {
    // Create regular .env file
    writeFileSync('.env', envContent);
    console.log('\n✅ Created .env file for development use');
    
    // Create encrypted configuration
    const iv = randomBytes(16);
    const encKey = Buffer.from(password.padEnd(32, '0').slice(0, 32));
    const cipher = createCipheriv('aes-256-cbc', encKey, iv);
    
    let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const encryptedConfig = {
      iv: iv.toString('hex'),
      data: encrypted
    };
    
    await write('bobby-config.enc', JSON.stringify(encryptedConfig));
    console.log('✅ Created encrypted bobby-config.enc for production use');
    
    // Create Docker env file
    writeFileSync('docker.env', envContent);
    console.log('✅ Created docker.env for Docker deployment');
    
    console.log('\n=== Configuration Complete ===');
    console.log('To start Bobby locally:');
    console.log('  bun run dev');
    console.log('\nTo deploy with Docker:');
    console.log('  docker run -d --name bobby --env-file docker.env -v bobby-docs:/app/docs -v bobby-db:/app/bobby.sqlite bobby-bot');
  } catch (error) {
    console.error('Error creating configuration files:', error);
    process.exit(1);
  }
}

// Run the wizard
configWizard();