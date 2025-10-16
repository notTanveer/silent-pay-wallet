import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import loc from '../loc';
import SeedWords from './SeedWords';

interface SeedVerificationProps {
  seed: string;
  onSuccess: () => void;
  onBack: () => void;
}

const SeedVerification: React.FC<SeedVerificationProps> = ({ seed, onSuccess, onBack }) => {
  const seedWords = seed.split(' ');
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [wordStatus, setWordStatus] = useState<{ [key: number]: 'default' | 'correct' | 'incorrect' }>({});
  const [selectionOrder, setSelectionOrder] = useState<{ [key: number]: number }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Shuffle the seed words
  useEffect(() => {
    const shuffled = [...seedWords].sort(() => 0.5 - Math.random());
    setShuffledWords(shuffled);
  }, [seed]);

  // Handle word selection
  const handleWordSelect = (word: string, index: number) => {
    const expectedWord = seedWords[selectedWords.length];
    const isCorrect = word === expectedWord;
    const currentSelectionIndex = selectedWords.length;

    // Update the word status (correct or incorrect)
    setWordStatus(prev => ({
      ...prev,
      [index]: isCorrect ? 'correct' : 'incorrect'
    }));

    // Track the selection order for correct words
    if (isCorrect) {
      setSelectionOrder(prev => ({
        ...prev,
        [index]: currentSelectionIndex
      }));
    }

    // Add the selected word to the array
    setSelectedWords(prev => [...prev, word]);

    // If incorrect, show error and reset after a delay
    if (!isCorrect) {
      // Display error message
      setErrorMessage(loc.pleasebackup.error);

      setTimeout(() => {
        setSelectedWords([]);
        setWordStatus({});
        setSelectionOrder({});
        setErrorMessage(null);
      }, 2500);
      return;
    }

    // If all words are selected correctly, call onSuccess
    if (selectedWords.length + 1 === seedWords.length) {
      setTimeout(() => {
        onSuccess();
      }, 500);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{loc.pleasebackup.heading}</Text>
        <Text style={styles.subtitle}>
          {loc.pleasebackup.subheading}
        </Text>
      </View>

      {/* Error message */}
      {errorMessage && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {/* Word selection grid */}
      <View style={styles.wordsGrid}>
        {shuffledWords.map((word, index) => {
          const status = wordStatus[index] || 'default';
          const isDisabled = selectedWords.includes(word);

          return (
            <SeedWords
              key={index}
              word={word}
              index={index}
              status={status}
              onPress={() => !isDisabled && handleWordSelect(word, index)}
              disabled={isDisabled}
              selectionOrder={selectionOrder[index] !== undefined ? selectionOrder[index] : null}
              isVerification={true}
            />
          );
        })}
      </View>

      {/* Back button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.button} onPress={onBack}>
          <Text style={styles.buttonText}>{loc.pleasebackup.show}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#222',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 16,
  },
  wordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  footer: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingVertical: 16,
  },
  button: {
    backgroundColor: '#FFA726',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
  },
});

export default SeedVerification;

