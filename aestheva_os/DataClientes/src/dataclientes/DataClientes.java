/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Main.java to edit this template
 */
package dataclientes;

import java.util.ArrayList;

public class DataClientes {
    
    public static void main(String[] args) {
        
        // 1. Creamos el contenedor donde van a vivir todos los pacientes
        ArrayList<Paciente> pacientes = new ArrayList<>();
        
        // 2. Creamos pacientes reales usando el constructor de Paciente.java
        Paciente p1 = new Paciente(1, "Juan García", 75.5, 1.78, "5551234567");
        Paciente p2 = new Paciente(2, "María López", 60.0, 1.65, "5559876543");
        
        // 3. Los metemos al ArrayList
        pacientes.add(p1);
        pacientes.add(p2);
        
        // 4. Recorremos la lista e imprimimos los datos de cada uno
        for (Paciente p : pacientes) {
            System.out.println("ID: " + p.id);
            System.out.println("Nombre: " + p.nombre);
            System.out.println("Peso: " + p.peso + " kg");
            System.out.println("Estatura: " + p.estatura + " m");
            System.out.println("Teléfono: " + p.telefono);
            System.out.println("Visitas: " + p.numeroVisitas);
            System.out.println("------------------------");
        }
        
    }
}
