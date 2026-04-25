import React from 'react';
import { NearbyStore } from '../types';
import MapPinIcon from './icons/MapPinIcon';

interface NearbyStoresProps {
    stores: NearbyStore[];
}

const NearbyStores: React.FC<NearbyStoresProps> = ({ stores }) => {
    if (stores.length === 0) {
        return null;
    }

    return (
        <div className="backdrop-blur-sm p-6 md:p-8 rounded-2xl shadow-md border border-stone-200/30 mb-8 animate-fade-in" style={{ backgroundColor: '#FFEFD5' }}>
            <h2 className="text-2xl font-bold mb-4 text-stone-800 flex items-center">
                <MapPinIcon className="w-6 h-6 mr-3 text-green-600" />
                Need Ingredients? Find a Store Near You
            </h2>
            <p className="text-stone-600 mb-6">Since you didn't specify any ingredients, here are some nearby places where you can shop:</p>
            <ul className="space-y-3">
                {stores.map((store, index) => (
                        <li key={index} className="bg-green-50/20 p-4 rounded-lg hover:bg-green-100/30 transition-colors" style={{ border: '1px solid rgba(0,0,0,0.85)' }}>
                        <a 
                            href={store.uri} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="font-semibold text-green-700 hover:text-green-800 flex items-center justify-between group"
                        >
                            <span>{store.name}</span>
                            <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">View on Map &rarr;</span>
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default NearbyStores;
